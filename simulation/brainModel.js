class BrainArchitecture{
    constructor(neuronCounts){
        this.levels=[];
        for(let i=0;i<neuronCounts.length-1;i++){
            this.levels.push(new SynapseLevel(
                neuronCounts[i],neuronCounts[i+1]
            ));
        }
    }

    static processSignals(givenInputs,network){
        let outputs=SynapseLevel.processSignals(
            givenInputs,network.levels[0]);
        for(let i=1;i<network.levels.length;i++){
            outputs=SynapseLevel.processSignals(
                outputs,network.levels[i]);
        }
        return outputs;
    }

    static mutateBrain(network, amount = 1) {
        network.levels.forEach(level => {
            for (let i = 0; i < level.biases.length; i++) {
                // Probabilistic bias mutation
                if (Math.random() < amount) {
                    level.biases[i] += (Math.random() * 2 - 1) * 0.5;
                    // Keep biases in a healthy learning range
                    if (level.biases[i] > 2) level.biases[i] = 2;
                    if (level.biases[i] < -2) level.biases[i] = -2;
                }
            }
            for (let i = 0; i < level.weights.length; i++) {
                for (let j = 0; j < level.weights[i].length; j++) {
                    // Probabilistic weight mutation
                    if (Math.random() < amount) {
                        // 10% chance to completely randomize a connection (explore)
                        if (Math.random() < 0.1) {
                            level.weights[i][j] = (Math.random() * 2 - 1) * 2;
                        } else {
                            // Tweak existing weight (exploit)
                            level.weights[i][j] += (Math.random() * 2 - 1) * 0.5;
                        }
                        
                        // Weights can grow as they learn
                        if (level.weights[i][j] > 5) level.weights[i][j] = 5;
                        if (level.weights[i][j] < -5) level.weights[i][j] = -5;
                    }
                }
            }
        });
    }
}

class SynapseLevel{
    constructor(inputCount,outputCount){
        this.inputs=new Array(inputCount);
        this.outputs=new Array(outputCount);
        this.biases=new Array(outputCount);

        this.weights=[];
        for(let i=0;i<inputCount;i++){
            this.weights[i]=new Array(outputCount);
        }

        SynapseLevel.#randomize(this);
    }

    static #randomize(level){
        // Initialize with very small weights so lines are THIN at Gen 1
        for(let i=0;i<level.inputs.length;i++){
            for(let j=0;j<level.outputs.length;j++){
                level.weights[i][j]=(Math.random()*2-1) * 0.1;
            }
        }

        for(let i=0;i<level.biases.length;i++){
            level.biases[i]=(Math.random()*2-1) * 0.1;
        }
    }

    static processSignals(givenInputs,level){
        for(let i=0;i<level.inputs.length;i++){
            level.inputs[i]=givenInputs[i];
        }

        for(let i=0;i<level.outputs.length;i++){
            let sum=0
            for(let j=0;j<level.inputs.length;j++){
                sum+=level.inputs[j]*level.weights[j][i];
            }

            // Sigmoid threshold for steering sensitivity
            const sigmoid = 1 / (1 + Math.exp(-(sum + level.biases[i])));
            level.outputs[i] = sigmoid > 0.5 ? 1 : 0;
        }

        return level.outputs;
    }
}
