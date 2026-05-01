window.onerror = function(msg, url, lineNo, columnNo, error) {
    const errorDiv = document.createElement("div");
    errorDiv.style.position = "fixed";
    errorDiv.style.top = "50%";
    errorDiv.style.left = "50%";
    errorDiv.style.transform = "translate(-50%, -50%)";
    errorDiv.style.backgroundColor = "rgba(255, 0, 170, 0.9)";
    errorDiv.style.color = "white";
    errorDiv.style.padding = "20px";
    errorDiv.style.borderRadius = "10px";
    errorDiv.style.zIndex = "9999";
    errorDiv.style.fontFamily = "Outfit, sans-serif";
    errorDiv.style.border = "2px solid #00ffd5";
    errorDiv.style.boxShadow = "0 0 20px #ff00aa";
    errorDiv.innerHTML = `<h3>SYSTEM FAILURE</h3><p>${msg}</p><small>${url} (Line: ${lineNo})</small>`;
    document.body.appendChild(errorDiv);
    return false;
};

/**
 * Main implementation of the Neon Autonomous Simulation Entry Point.
 */

const simCanvas = document.getElementById("simCanvas");
const brainCanvas = document.getElementById("brainCanvas");
const radarCanvas = document.getElementById("radarCanvas");

const simCtx = simCanvas.getContext("2d");
const brainCtx = brainCanvas.getContext("2d");

// Global objects
let camera, radar, swarm, leadVehicle, roadBorders, routeDiscovery;
const roadTraffic = [];

// Theme Management
let isDarkTheme = localStorage.getItem("simTheme") !== "light";
document.body.classList.toggle("light-theme", !isDarkTheme);

function toggleTheme() {
    isDarkTheme = !isDarkTheme;
    document.body.classList.toggle("light-theme", !isDarkTheme);
    localStorage.setItem("simTheme", isDarkTheme ? "dark" : "light");
}

function getThemeColor(varName) {
    return getComputedStyle(document.body).getPropertyValue(varName).trim();
}

// Window Management
function toggleWindow(id) {
    const win = document.getElementById(id);
    const toggleBtn = document.getElementById(id.split('-')[0] + '-toggle');
    
    if (win.classList.contains('visible')) {
        win.style.display = 'none';
        win.classList.remove('visible');
        if (toggleBtn) toggleBtn.classList.remove('active');
    } else {
        win.style.display = 'flex';
        win.classList.add('visible');
        if (toggleBtn) toggleBtn.classList.add('active');
        setTimeout(handleResize, 100);
    }
}

function handleResize() {
    simCanvas.width = window.innerWidth;
    simCanvas.height = window.innerHeight;
    
    const rCont = radarCanvas.parentElement;
    if (rCont && rCont.clientWidth > 0) {
        radarCanvas.width = rCont.clientWidth;
        radarCanvas.height = rCont.clientHeight;
    }
    
    const bCont = brainCanvas.parentElement;
    if (bCont && bCont.clientWidth > 0) {
        brainCanvas.width = bCont.clientWidth;
        brainCanvas.height = bCont.clientHeight;
    }
    
    if (camera) camera.resize();
    if (radar) radar.resize(radarCanvas.width, radarCanvas.height);
}

window.addEventListener('resize', handleResize);

function initSimulation() {
    console.log("INITIALIZING NEON SIMULATION...");
    
    handleResize();
    document.body.classList.toggle("light-theme", !isDarkTheme);

    if (typeof simulationMap === 'undefined') {
        const errorMsg = "simulationMap is missing.";
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    
    roadTraffic.length = 0;
    roadBorders = simulationMap.roadBorders;

    const defaultZoom = simulationMap.zoom || 1;
    const defaultOffset = simulationMap.offset || { x: 0, y: 0 };
    
    camera = new CameraTracker(simCanvas, defaultZoom, defaultOffset);
    radar = new RadarDisplay(radarCanvas, simulationMap.graph, radarCanvas.width, radarCanvas.height);

    // Initialize Intelligence Layer
    routeDiscovery = new RouteDiscovery(simulationMap.graph);
    const startNodes = simulationMap.markings.filter((m) => m.type == "start");
    // Fallback to graph[0] if no start marking exists
    const startPoint = startNodes.length > 0 ? startNodes[0].center : (simulationMap.graph.points[0] || new GeoPoint(100, 100));
    routeDiscovery.calculateDistances(startPoint);

    const POPULATION_SIZE = 100;
    swarm = spawnVehicles(POPULATION_SIZE);

    if (!swarm || swarm.length === 0) {
        throw new Error("Swarm failed to spawn.");
    }

    leadVehicle = swarm[0];

    const storedBrain = localStorage.getItem("optimalBrain");
    if (storedBrain) {
        for (let i = 0; i < swarm.length; i++) {
            try {
                swarm[i].brain = JSON.parse(storedBrain);
                if (i !== 0) {
                    BrainArchitecture.mutateBrain(swarm[i].brain, 0.1);
                }
            } catch (e) {
                console.warn("Stored brain corrupted.");
            }
        }
    }

    requestAnimationFrame(runSimLoop);
}

function saveBrain() {
    if (leadVehicle) {
        localStorage.setItem("optimalBrain", JSON.stringify(leadVehicle.brain));
        console.log("Neural state preserved.");
    }
}

// FULL RESET: Wipes all evolutionary history and learned data
function discardBrain() {
    localStorage.removeItem("optimalBrain");
    localStorage.removeItem("generationCount");
    localStorage.removeItem("peakFitness");
    localStorage.removeItem("lastGenPeak");
    
    console.log("FACTORY RESET: All evolutionary data purged.");
    location.reload();
}

// Robust Start sequence
if (document.readyState === 'loading') {
    window.addEventListener('load', initSimulation);
} else {
    initSimulation();
}
