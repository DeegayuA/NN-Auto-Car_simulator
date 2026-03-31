class NeuroVisualizer{
    static drawNetwork(ctx,network){
        const margin=50;
        const left=margin;
        const top=margin;
        const width=ctx.canvas.width-margin*2;
        const height=ctx.canvas.height-margin*2;

        const layerHeight=height/network.levels.length;

        for(let i=network.levels.length-1;i>=0;i--){
            const layerTop=top+
                linearInterpolation(
                    height-layerHeight,
                    0,
                    network.levels.length==1
                        ?0.5
                        :i/(network.levels.length-1)
                );

            ctx.setLineDash([7,3]);
            NeuroVisualizer.drawSynapseLevel(ctx,network.levels[i],
                left,layerTop,
                width,layerHeight,
                i==network.levels.length-1
                    ?['🠉','🠈','🠊','🠋']
                    :[]
            );
        }
    }

    static drawSynapseLevel(ctx,layer,left,top,width,height,outputLabels){
        const right=left+width;
        const bottom=top+height;

        const {inputs,outputs,weights,biases}=layer;

        for(let i=0;i<inputs.length;i++){
            for(let j=0;j<outputs.length;j++){
                ctx.beginPath();
                ctx.moveTo(
                    NeuroVisualizer.#getNodeX(inputs,i,left,right),
                    bottom
                );
                ctx.lineTo(
                    NeuroVisualizer.#getNodeX(outputs,j,left,right),
                    top
                );
                ctx.lineWidth=2;
                ctx.strokeStyle=getNeonRGBA(weights[i][j]);
                ctx.stroke();
            }
        }

        const nodeRadius=18;
        const nodeBg = getThemeColor("--bg-sidebar");
        const labelColor = getThemeColor("--neon-yellow");

        for(let i=0;i<inputs.length;i++){
            const x=NeuroVisualizer.#getNodeX(inputs,i,left,right);
            ctx.beginPath();
            ctx.arc(x,bottom,nodeRadius,0,Math.PI*2);
            ctx.fillStyle=nodeBg;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x,bottom,nodeRadius*0.6,0,Math.PI*2);
            ctx.fillStyle=getNeonRGBA(inputs[i]);
            ctx.fill();
        }
        
        for(let i=0;i<outputs.length;i++){
            const x=NeuroVisualizer.#getNodeX(outputs,i,left,right);
            ctx.beginPath();
            ctx.arc(x,top,nodeRadius,0,Math.PI*2);
            ctx.fillStyle=nodeBg;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x,top,nodeRadius*0.6,0,Math.PI*2);
            ctx.fillStyle=getNeonRGBA(outputs[i]);
            ctx.fill();

            ctx.beginPath();
            ctx.lineWidth=2;
            ctx.arc(x,top,nodeRadius*0.8,0,Math.PI*2);
            ctx.strokeStyle=getNeonRGBA(biases[i]);
            ctx.setLineDash([3,3]);
            ctx.stroke();
            ctx.setLineDash([]);

            if(outputLabels[i]){
                ctx.beginPath();
                ctx.textAlign="center";
                ctx.textBaseline="middle";
                ctx.fillStyle=labelColor;
                ctx.font=(nodeRadius*1.5)+"px Arial";
                ctx.fillText(outputLabels[i],x,top+nodeRadius*0.1);
            }
        }
    }

    static #getNodeX(nodes,index,left,right){
        return linearInterpolation(
            left,
            right,
            nodes.length==1
                ?0.5
                :index/(nodes.length-1)
        );
    }
}
