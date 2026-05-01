let generationCount = parseInt(localStorage.getItem("generationCount")) || 1;
let stuckTimer = 0;
const MAX_STUCK_TIME = 150; // ~2.5 seconds at 60fps
let frameCount = 0;

let peakFitness = parseFloat(localStorage.getItem("peakFitness")) || 0;
let lastGenPeak = parseFloat(localStorage.getItem("lastGenPeak")) || 0;

// Fitness history to detect looping
let lastFitnessCheck = 0;
let fitnessHistory = [];

let globalMaxSpeed = 3;

function changeSpeed(val) {
    globalMaxSpeed = parseFloat(val);
    const speedValElem = document.getElementById("speed-val");
    if (speedValElem) {
        speedValElem.innerText = (globalMaxSpeed * 10).toFixed(1) + " km/h";
    }
    if (swarm) {
        swarm.forEach(car => car.maxSpeed = globalMaxSpeed);
    }
}

function manualReset() {
    console.log("MANUAL RESET TRIGGERED.");
    resetGeneration();
}

function spawnVehicles(N) {
    const startNodes = simulationMap.markings.filter((m) => m.type == "start");
    const startPoint = startNodes.length > 0 ? startNodes[0].center : new GeoPoint(100, 100);
    const dir = startNodes.length > 0 ? startNodes[0].directionVector : new GeoPoint(0, -1);
    const startAngle = -getAngle(dir) + Math.PI / 2;
    
    const generated = [];
    for (let i = 1; i <= N; i++) {
        const vehicle = new AutonomousVehicle(startPoint.x, startPoint.y, 30, 50, "AI", startAngle, globalMaxSpeed);
        generated.push(vehicle);
    }
    return generated;
}

function resetGeneration() {
    console.log("GENERATION COMPLETE. EVOLVING...");
    
    if (leadVehicle) {
        lastGenPeak = leadVehicle.survivalScore;
        localStorage.setItem("lastGenPeak", lastGenPeak);
        
        if (lastGenPeak > peakFitness) {
            peakFitness = lastGenPeak;
            localStorage.setItem("peakFitness", peakFitness);
        }
        localStorage.setItem("optimalBrain", JSON.stringify(leadVehicle.brain));
    }

    generationCount++;
    localStorage.setItem("generationCount", generationCount);

    const POPULATION_SIZE = 100;
    swarm = spawnVehicles(POPULATION_SIZE);
    
    const storedBrain = localStorage.getItem("optimalBrain");
    if (storedBrain) {
        for (let i = 0; i < swarm.length; i++) {
            swarm[i].brain = JSON.parse(storedBrain);
            if (i !== 0) {
                const rate = i % 5 === 0 ? 0.5 : 0.15; 
                BrainArchitecture.mutateBrain(swarm[i].brain, rate);
            }
        }
    }
    
    leadVehicle = swarm[0];
    stuckTimer = 0;
    fitnessHistory = [];
}

function updateMetricsUI() {
    if (frameCount % 5 !== 0) return;

    const archElem = document.getElementById("nn-arch");
    if (archElem && leadVehicle && leadVehicle.brain) {
        const counts = [leadVehicle.lidar.beamCount];
        leadVehicle.brain.levels.forEach(l => counts.push(l.outputs.length));
        archElem.innerText = counts.join("-");
    }

    const mapGenElem = document.getElementById("map-gen-count");
    if (mapGenElem) mapGenElem.innerText = generationCount;

    const mapFitnessElem = document.getElementById("map-best-fitness");
    if (mapFitnessElem && leadVehicle) {
        const currentBest = Math.max(peakFitness, leadVehicle.survivalScore);
        mapFitnessElem.innerText = Math.floor(currentBest);
    }

    const trendElem = document.getElementById("evolution-trend");
    if (trendElem && leadVehicle) {
        if (lastGenPeak > 0) {
            const currentScore = leadVehicle.survivalScore;
            const improvement = ((currentScore - lastGenPeak) / lastGenPeak) * 100;
            const sign = improvement >= 0 ? "+" : "";
            trendElem.innerText = sign + improvement.toFixed(1) + "%";
            trendElem.style.color = improvement >= 0 ? "var(--neon-cyan)" : "var(--neon-magenta)";
        }
    }

    const aliveCount = swarm.filter(v => !v.damaged).length;
    const fleetElem = document.getElementById("fleet-alive");
    if (fleetElem) {
        fleetElem.innerText = `${aliveCount} / ${swarm.length}`;
    }

    const mapSpeedElem = document.getElementById("map-speed");
    if (mapSpeedElem && leadVehicle) {
        mapSpeedElem.innerText = (leadVehicle.speed * 10).toFixed(1) + " km/h";
    }
}

function runSimLoop(time) {
    frameCount++;
    
    for (let i = 0; i < roadTraffic.length; i++) {
        roadTraffic[i].update(roadBorders, []);
    }
    
    let allDamaged = true;
    for (let i = 0; i < swarm.length; i++) {
        swarm[i].update(roadBorders, roadTraffic);
        if (!swarm[i].damaged) allDamaged = false;
    }
    
    // LOOP & STAGNATION DETECTION (2-Second Window)
    if (leadVehicle) {
        fitnessHistory.push(leadVehicle.survivalScore);
        if (fitnessHistory.length > 72) { // Faster window: ~1.2 seconds
            const pastScore = fitnessHistory.shift();
            const currentScore = leadVehicle.survivalScore;
            
            if (Math.abs(currentScore - pastScore) < 80) { // Slightly tighter buffer
                stuckTimer++;
            } else {
                stuckTimer = 0;
            }
        }
    }

    if (allDamaged || stuckTimer > 10) { 
        resetGeneration();
        return requestAnimationFrame(runSimLoop);
    }

    const survivingVehicles = swarm.filter(v => !v.damaged);
    if (survivingVehicles.length > 0) {
        leadVehicle = survivingVehicles.find(
            (v) => v.survivalScore === Math.max(...survivingVehicles.map((vehicle) => vehicle.survivalScore))
        );
    } else {
        leadVehicle = swarm.find(
            (v) => v.survivalScore === Math.max(...swarm.map((vehicle) => vehicle.survivalScore))
        );
    }

    simulationMap.cars = swarm;
    simulationMap.bestCar = leadVehicle;

    if (leadVehicle) {
        camera.offset.x = -leadVehicle.center.x;
        camera.offset.y = -leadVehicle.center.y;
    }

    camera.reset();
    const viewPoint = scalePoint(camera.getOffset(), -1);
    
    simCtx.clearRect(0, 0, simCanvas.width, simCanvas.height);
    simulationMap.draw(simCtx, viewPoint, false);
    
    if (radar) radar.update(viewPoint, swarm);

    if (leadVehicle) {
        brainCtx.lineDashOffset = -time / 50;
        brainCtx.clearRect(0, 0, brainCanvas.width, brainCanvas.height);
        NeuroVisualizer.drawNetwork(brainCtx, leadVehicle.brain);
    }
    
    updateMetricsUI();
    requestAnimationFrame(runSimLoop);
}
