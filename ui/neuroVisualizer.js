class NeuroVisualizer {
    static drawNetwork(ctx, network, baseNetwork = null) {
        const margin = 50;
        const left = margin;
        const width = ctx.canvas.width - margin * 2;
        
        const maxNetHeight = ctx.canvas.height * 0.75; 
        const top = (ctx.canvas.height - maxNetHeight) / 2 + 10;
        const layerHeight = maxNetHeight / network.levels.length;

        for (let i = 0; i < network.levels.length; i++) {
            const layerBottom = ctx.canvas.height - margin - 35 - i * layerHeight;
            const layerTop = layerBottom - layerHeight;
            const isHidden = (i > 0 && i < network.levels.length - 1);
            
            // Hidden layers are much more subtle to focus on Input/Output
            const opacityMultiplier = isHidden ? 0.2 : 1.0;
            const baseLayer = baseNetwork ? baseNetwork.levels[i] : null;
            NeuroVisualizer.drawSynapses(ctx, network.levels[i], left, layerTop, width, layerHeight, opacityMultiplier, baseLayer);
        }

        for (let i = 0; i < network.levels.length; i++) {
            const layerBottom = ctx.canvas.height - margin - 35 - i * layerHeight;
            const layerTop = layerBottom - layerHeight;
            const isAbsoluteInput = (i == 0);
            const isAbsoluteOutput = (i == network.levels.length - 1);

            NeuroVisualizer.drawNodes(ctx, network.levels[i], left, layerTop, width, layerHeight, {
                isInput: isAbsoluteInput,
                isOutput: isAbsoluteOutput,
                isHidden: !isAbsoluteInput && !isAbsoluteOutput
            });
        }
    }

    static drawSynapses(ctx, layer, left, top, width, height, opacityMultiplier, baseLayer = null) {
        const right = left + width;
        const bottom = top + height;
        const { inputs, outputs, weights } = layer;

        ctx.lineCap = "round";
        for (let i = 0; i < inputs.length; i++) {
            for (let j = 0; j < outputs.length; j++) {
                const weight = weights[i][j];
                const baseWeight = baseLayer ? baseLayer.weights[i][j] : 0;
                
                // Show learning: The delta between current weight and start-of-generation weight
                const learningDelta = weight - baseWeight;
                const absDelta = Math.abs(learningDelta);
                const absBase = Math.abs(baseWeight);
                
                // To show previous gen structure thinly (divided by 10) + this gen's learning dynamically
                const visualWeight = (absBase * 0.1) + absDelta;
                
                // Ignore very weak connections to reduce visual clutter
                if (visualWeight < 0.02) continue;

                const x1 = NeuroVisualizer.#getNodeX(inputs, i, left, right);
                const x2 = NeuroVisualizer.#getNodeX(outputs, j, left, right);

                // Linear scaling capped at a maximum thickness so lines never become massive blobs
                ctx.lineWidth = 0.5 + Math.min(6, visualWeight * 4); 
                
                ctx.beginPath();
                ctx.moveTo(x1, bottom);
                ctx.lineTo(x2, top);
                
                const baseOpacity = 0.2 + visualWeight * 0.8;
                const opacity = Math.min(1, baseOpacity * opacityMultiplier);
                
                // Positive = Cyan, Negative = Magenta. Color determined by the new weight state.
                ctx.strokeStyle = weight > 0 ? `rgba(0, 255, 213, ${opacity})` : `rgba(255, 0, 170, ${opacity})`;
                ctx.stroke();
            }
        }
    }

    static drawNodes(ctx, layer, left, top, width, height, info) {
        const right = left + width;
        const bottom = top + height;
        const { inputs, outputs, biases } = layer;
        
        const nodeRadius = info.isHidden ? 8 : 18;
        const opacity = info.isHidden ? 0.3 : 1.0;

        for (let i = 0; i < inputs.length; i++) {
            const x = NeuroVisualizer.#getNodeX(inputs, i, left, right);
            this.#drawHighFidelityNode(ctx, x, bottom, nodeRadius, inputs[i], null, opacity);
            
            if (info.isInput) {
                ctx.save();
                ctx.shadowBlur = 8;
                ctx.shadowColor = "black";
                ctx.fillStyle = "white";
                ctx.font = "bold 13px Outfit";
                ctx.textAlign = "center";
                ctx.fillText("S" + (i + 1), x, bottom + 25);
                ctx.restore();
            }
        }

        for (let i = 0; i < outputs.length; i++) {
            const x = NeuroVisualizer.#getNodeX(outputs, i, left, right);
            this.#drawHighFidelityNode(ctx, x, top, nodeRadius, outputs[i], biases[i], opacity);

            if (info.isOutput) {
                const labels = ["↑", "←", "→", "↓"];
                const desc = ["FWD", "LFT", "RGT", "REV"];
                if (labels[i]) {
                    ctx.save();
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = "black";
                    ctx.fillStyle = outputs[i] > 0.5 ? "var(--neon-cyan)" : "white";
                    ctx.font = "bold 20px Outfit";
                    ctx.textAlign = "center";
                    ctx.fillText(labels[i], x, top - 20);
                    
                    ctx.font = "bold 10px Outfit";
                    ctx.fillStyle = outputs[i] > 0.5 ? "var(--neon-cyan)" : "rgba(255, 255, 255, 0.6)";
                    ctx.fillText(desc[i], x, top - 36);
                    ctx.restore();
                }
            }
        }
    }

    static #drawHighFidelityNode(ctx, x, y, radius, val, bias = null, globalOpacity = 1.0) {
        const color = val > 0.5 ? "0, 255, 213" : "255, 0, 170";
        const alpha = Math.abs(val) * globalOpacity;
        
        const g1 = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius * 2.8);
        g1.addColorStop(0, `rgba(${color}, ${alpha * 0.45})`);
        g1.addColorStop(1, `rgba(${color}, 0)`);
        ctx.beginPath();
        ctx.arc(x, y, radius * 2.8, 0, Math.PI * 2);
        ctx.fillStyle = g1;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(5, 6, 8, ${globalOpacity})`;
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${color}, ${0.3 + alpha * 0.7})`;
        ctx.lineWidth = radius < 12 ? 1.5 : 3.5;
        ctx.stroke();

        if (alpha > 0.05) {
            const innerRadius = radius * 0.65 * Math.min(1, alpha * 2);
            ctx.beginPath();
            ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${color}, ${globalOpacity})`;
            ctx.fill();
        }

        if (bias !== null && globalOpacity > 0.5) {
            ctx.beginPath();
            ctx.arc(x, y, radius * 1.2, 0, Math.PI * 2);
            ctx.strokeStyle = bias > 0 ? "rgba(0, 255, 213, 0.35)" : "rgba(255, 0, 170, 0.35)";
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    static #getNodeX(nodes, index, left, right) {
        return linearInterpolation(left, right, nodes.length == 1 ? 0.5 : index / (nodes.length - 1));
    }
}
