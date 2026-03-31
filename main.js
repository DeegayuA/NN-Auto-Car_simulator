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
simCanvas.width = window.innerWidth - 330;
simCanvas.height = window.innerHeight;

const brainCanvas = document.getElementById("brainCanvas");
brainCanvas.width = 300;
brainCanvas.height = window.innerHeight - 300;

const radarCanvas = document.getElementById("radarCanvas");
radarCanvas.width = 300;
radarCanvas.height = 300;

const simCtx = simCanvas.getContext("2d");
const brainCtx = brainCanvas.getContext("2d");

// Global objects (initialized in other scripts or during init)
let camera, radar, swarm, leadVehicle, roadBorders;
const roadTraffic = [];

// Theme Management
let isDarkTheme = localStorage.getItem("simTheme") !== "light";
document.body.classList.toggle("light-theme", !isDarkTheme);

function toggleTheme() {
    isDarkTheme = !isDarkTheme;
    document.body.classList.toggle("light-theme", !isDarkTheme);
    localStorage.setItem("simTheme", isDarkTheme ? "dark" : "light");
    console.log("Theme switched to:", isDarkTheme ? "Dark" : "Light");
}

function getThemeColor(varName) {
    return getComputedStyle(document.body).getPropertyValue(varName).trim();
}

function initSimulation() {
    console.log("INITIALIZING NEON SIMULATION...");
    // Sync UI to initial theme
    document.body.classList.toggle("light-theme", !isDarkTheme);

    // simulationMap is already defined in simulationData.js as a global const
    if (typeof simulationMap === 'undefined') {
        const errorMsg = "simulationMap is missing. Ensure simulationData.js is loaded correctly.";
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    
    console.log("Map detected. Success.");
    roadTraffic.length = 0;
    roadBorders = simulationMap.roadBorders;

    // Initialization of trackers with robust defaults
    const defaultZoom = simulationMap.zoom || 1;
    const defaultOffset = simulationMap.offset || { x: 0, y: 0 };
    
    console.log("Setting up camera with zoom:", defaultZoom, "offset:", defaultOffset);
    camera = new CameraTracker(simCanvas, defaultZoom, defaultOffset);
    radar = new RadarDisplay(radarCanvas, simulationMap.graph, 300);

    // Population Spawn
    const POPULATION_SIZE = 100;
    console.log("Spawning swarm of size:", POPULATION_SIZE);
    swarm = spawnVehicles(POPULATION_SIZE);

    if (!swarm || swarm.length === 0) {
        throw new Error("Swarm failed to spawn. No entities detected.");
    }

    leadVehicle = swarm[0];
    console.log("Lead vehicle at:", leadVehicle.center.x, leadVehicle.center.y);

    const storedBrain = localStorage.getItem("optimalBrain");
    if (storedBrain) {
        console.log("Applying stored neural state...");
        for (let i = 0; i < swarm.length; i++) {
            try {
                swarm[i].brain = JSON.parse(storedBrain);
                if (i !== 0) {
                    BrainArchitecture.mutateBrain(swarm[i].brain, 0.1);
                }
            } catch (e) {
                console.warn("Stored brain corrupted, using default.");
            }
        }
    }

    console.log("Simulation loop starting...");
    requestAnimationFrame(runSimLoop);
}

function saveBrain() {
    if (leadVehicle) {
        localStorage.setItem("optimalBrain", JSON.stringify(leadVehicle.brain));
        console.log("Neural state preserved.");
    }
}

function discardBrain() {
    localStorage.removeItem("optimalBrain");
    console.log("Neural state wiped.");
    location.reload();
}

// Robust Start sequence
if (document.readyState === 'loading') {
    window.addEventListener('load', initSimulation);
} else {
    initSimulation();
}
