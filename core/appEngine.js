let generationCount = parseInt(localStorage.getItem("generationCount")) || 1;
let stuckTimer = 0;
const MAX_STUCK_TIME = 150; // ~2.5 seconds at 60fps
let frameCount = 0;

let peakFitness = parseFloat(localStorage.getItem("peakFitness")) || 0;
let lastGenPeak = parseFloat(localStorage.getItem("lastGenPeak")) || 0;

// Fitness history to detect looping
let lastFitnessCheck = 0;
let fitnessHistory = [];

let globalMaxSpeed = 6;
let generationStartBrain = null;

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
        let parsedBrain = JSON.parse(storedBrain);
        
        // Architecture Check: Ensure the loaded brain matches the new topology
        if (parsedBrain.levels && parsedBrain.levels.length === swarm[0].brain.levels.length) {
            generationStartBrain = parsedBrain;
            for (let i = 0; i < swarm.length; i++) {
                swarm[i].brain = JSON.parse(storedBrain);
                if (i !== 0) {
                    const rate = i % 5 === 0 ? 0.5 : 0.15; 
                    BrainArchitecture.mutateBrain(swarm[i].brain, rate);
                }
            }
        } else {
            console.log("ARCHITECTURE CHANGE DETECTED: Clearing old brain.");
            localStorage.removeItem("optimalBrain");
            localStorage.setItem("generationCount", 1);
            generationCount = 1;
            generationStartBrain = JSON.parse(JSON.stringify(swarm[0].brain));
        }
    } else {
        generationStartBrain = JSON.parse(JSON.stringify(swarm[0].brain));
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
    
    // 1. Identify the most successful ALIVE car (The Leader)
    const survivingVehicles = swarm.filter(v => !v.damaged);
    if (survivingVehicles.length > 0) {
        // Find car with highest fitness among SURVIVORS
        leadVehicle = survivingVehicles.reduce((best, car) => 
            (car.survivalScore > best.survivalScore) ? car : best, survivingVehicles[0]);
    } else {
        // If all are dead, follow the one that went furthest before dying
        leadVehicle = swarm.reduce((best, car) => 
            (car.survivalScore > best.survivalScore) ? car : best, swarm[0]);
    }

    simulationMap.cars = swarm;
    simulationMap.bestCar = leadVehicle;

    // Real-time Peak Fitness Update
    if (leadVehicle && leadVehicle.survivalScore > peakFitness) {
        peakFitness = leadVehicle.survivalScore;
        localStorage.setItem("peakFitness", peakFitness);
    }

    // 2. Swarm Death Check (only reset if the WHOLE swarm is gone or the LEADER is stagnant)
    if (allDamaged) {
        resetGeneration();
        return requestAnimationFrame(runSimLoop);
    }

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
        
        // If this is the very first frame before resetGeneration, set a default
        if (!generationStartBrain && swarm[0]) {
            generationStartBrain = JSON.parse(JSON.stringify(swarm[0].brain));
        }

        NeuroVisualizer.drawNetwork(brainCtx, leadVehicle.brain, generationStartBrain);
    }
    
    updateMetricsUI();
    requestAnimationFrame(runSimLoop);
}
