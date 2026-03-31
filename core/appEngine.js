function spawnVehicles(N) {
    const startNodes = simulationMap.markings.filter((m) => m.type == "start");
    console.log("Start nodes found:", startNodes.length);
    const startPoint = startNodes.length > 0 ? startNodes[0].center : new GeoPoint(100, 100);
    const dir = startNodes.length > 0 ? startNodes[0].directionVector : new GeoPoint(0, -1);
    const startAngle = -getAngle(dir) + Math.PI / 2;
    
    const generated = [];
    for (let i = 1; i <= N; i++) {
        generated.push(new AutonomousVehicle(startPoint.x, startPoint.y, 30, 50, "AI", startAngle));
    }
    console.log("Swarm spawned:", generated.length);
    return generated;
}

function runSimLoop(time) {
    for (let i = 0; i < roadTraffic.length; i++) {
        roadTraffic[i].update(roadBorders, []);
    }
    
    for (let i = 0; i < swarm.length; i++) {
        swarm[i].update(roadBorders, roadTraffic);
    }
    
    const survivingVehicles = swarm.filter(v => !v.damaged);
    if (survivingVehicles.length > 0) {
        leadVehicle = survivingVehicles.find(
            (v) => v.survivalScore === Math.max(...survivingVehicles.map((vehicle) => vehicle.survivalScore))
        );
    } else {
        // Fallback to the best among damaged if all are crashed
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
    simulationMap.draw(simCtx, viewPoint, false);
    radar.update(viewPoint);

    for (let i = 0; i < roadTraffic.length; i++) {
        roadTraffic[i].draw(simCtx);
    }

    if (leadVehicle) {
        brainCtx.lineDashOffset = -time / 50;
        brainCtx.clearRect(0, 0, brainCanvas.width, brainCanvas.height);
        NeuroVisualizer.drawNetwork(brainCtx, leadVehicle.brain);
    }
    
    requestAnimationFrame(runSimLoop);
}
