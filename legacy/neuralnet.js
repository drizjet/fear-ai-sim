/**
 * Neural Network Library for MASAC - FIXED VERSION
 * Proper backpropagation and training
 */

class Matrix {
    constructor(rows, cols, data = null) {
        this.rows = rows;
        this.cols = cols;
        this.data = data || new Float32Array(rows * cols);
        this.grad = null; // Gradient storage
    }

    static zeros(rows, cols) {
        return new Matrix(rows, cols);
    }

    static random(rows, cols, scale = 1.0) {
        const m = new Matrix(rows, cols);
        const xavierScale = scale * Math.sqrt(2.0 / (rows + cols));
        for (let i = 0; i < m.data.length; i++) {
            m.data[i] = (Math.random() * 2 - 1) * xavierScale;
        }
        return m;
    }

    static fromArray(arr) {
        const rows = arr.length;
        const cols = arr[0]?.length || 1;
        const m = new Matrix(rows, cols);
        for (let i = 0; i < rows; i++) {
            if (Array.isArray(arr[i])) {
                for (let j = 0; j < cols; j++) {
                    m.data[i * cols + j] = arr[i][j];
                }
            } else {
                m.data[i] = arr[i];
            }
        }
        return m;
    }

    get(i, j) { return this.data[i * this.cols + j]; }
    set(i, j, val) { this.data[i * this.cols + j] = val; }

    add(other) {
        const result = new Matrix(this.rows, this.cols);
        for (let i = 0; i < this.data.length; i++) {
            result.data[i] = this.data[i] + other.data[i];
        }
        return result;
    }

    subtract(other) {
        const result = new Matrix(this.rows, this.cols);
        for (let i = 0; i < this.data.length; i++) {
            result.data[i] = this.data[i] - other.data[i];
        }
        return result;
    }

    multiply(other) {
        const result = new Matrix(this.rows, this.cols);
        for (let i = 0; i < this.data.length; i++) {
            result.data[i] = this.data[i] * other.data[i];
        }
        return result;
    }

    scale(scalar) {
        const result = new Matrix(this.rows, this.cols);
        for (let i = 0; i < this.data.length; i++) {
            result.data[i] = this.data[i] * scalar;
        }
        return result;
    }

    matmul(other) {
        const result = new Matrix(this.rows, other.cols);
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < other.cols; j++) {
                let sum = 0;
                for (let k = 0; k < this.cols; k++) {
                    sum += this.get(i, k) * other.get(k, j);
                }
                result.set(i, j, sum);
            }
        }
        return result;
    }

    transpose() {
        const result = new Matrix(this.cols, this.rows);
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.cols; j++) {
                result.set(j, i, this.get(i, j));
            }
        }
        return result;
    }

    map(fn) {
        const result = new Matrix(this.rows, this.cols);
        for (let i = 0; i < this.data.length; i++) {
            result.data[i] = fn(this.data[i]);
        }
        return result;
    }

    clone() {
        const m = new Matrix(this.rows, this.cols);
        m.data.set(this.data);
        return m;
    }
}

// Activation functions
const Activations = {
    relu: {
        fn: (x) => Math.max(0, x),
        grad: (x) => x > 0 ? 1 : 0
    },
    tanh: {
        fn: Math.tanh,
        grad: (x) => 1 - Math.tanh(x) ** 2
    },
    sigmoid: {
        fn: (x) => 1 / (1 + Math.exp(-x)),
        grad: (x) => {
            const s = 1 / (1 + Math.exp(-x));
            return s * (1 - s);
        }
    },
    linear: {
        fn: (x) => x,
        grad: () => 1
    }
};

// Layer with proper gradient computation
class Layer {
    constructor(inputSize, outputSize, activation = 'relu') {
        this.inputSize = inputSize;
        this.outputSize = outputSize;
        this.activation = Activations[activation];
        
        // Xavier initialization
        const scale = Math.sqrt(2.0 / (inputSize + outputSize));
        this.weights = Matrix.random(outputSize, inputSize, scale);
        this.biases = Matrix.zeros(outputSize, 1);
        
        // Gradients
        this.weightGrad = Matrix.zeros(outputSize, inputSize);
        this.biasGrad = Matrix.zeros(outputSize, 1);
        
        // For momentum
        this.mW = Matrix.zeros(outputSize, inputSize);
        this.vW = Matrix.zeros(outputSize, inputSize);
        this.mB = Matrix.zeros(outputSize, 1);
        this.vB = Matrix.zeros(outputSize, 1);
        
        // Cache for backprop
        this.lastInput = null;
        this.lastZ = null;
        this.lastOutput = null;
    }

    forward(input) {
        this.lastInput = input.clone();
        
        // z = W @ x + b
        this.lastZ = this.weights.matmul(input);
        for (let i = 0; i < this.lastZ.rows; i++) {
            this.lastZ.data[i] += this.biases.data[i];
        }
        
        // activation(z)
        this.lastOutput = this.lastZ.map(this.activation.fn);
        return this.lastOutput;
    }

    backward(gradOutput, learningRate, t = 1) {
        // Gradient of activation: dL/dz = dL/da * activation'(z)
        const gradZ = new Matrix(gradOutput.rows, gradOutput.cols);
        for (let i = 0; i < gradOutput.data.length; i++) {
            const actGrad = this.activation.grad(this.lastZ.data[i]);
            gradZ.data[i] = gradOutput.data[i] * actGrad;
        }
        
        // Gradient for weights: dL/dW = dL/dz @ x^T
        this.weightGrad = gradZ.matmul(this.lastInput.transpose());
        
        // Gradient for biases: dL/db = dL/dz
        this.biasGrad = gradZ;
        
        // Gradient for previous layer: dL/dx = W^T @ dL/dz
        const gradInput = this.weights.transpose().matmul(gradZ);
        
        // Adam optimizer update
        const beta1 = 0.9;
        const beta2 = 0.999;
        const eps = 1e-8;
        
        // Update weights with Adam
        for (let i = 0; i < this.weights.rows; i++) {
            for (let j = 0; j < this.weights.cols; j++) {
                const g = this.weightGrad.get(i, j);
                
                // m = beta1 * m + (1 - beta1) * g
                this.mW.set(i, j, beta1 * this.mW.get(i, j) + (1 - beta1) * g);
                
                // v = beta2 * v + (1 - beta2) * g^2
                this.vW.set(i, j, beta2 * this.vW.get(i, j) + (1 - beta2) * g * g);
                
                // Bias correction
                const mHat = this.mW.get(i, j) / (1 - Math.pow(beta1, t));
                const vHat = this.vW.get(i, j) / (1 - Math.pow(beta2, t));
                
                // Update
                const update = learningRate * mHat / (Math.sqrt(vHat) + eps);
                this.weights.set(i, j, this.weights.get(i, j) - update);
            }
        }
        
        // Update biases with Adam
        for (let i = 0; i < this.biases.rows; i++) {
            const g = this.biasGrad.data[i];
            
            this.mB.data[i] = beta1 * this.mB.data[i] + (1 - beta1) * g;
            this.vB.data[i] = beta2 * this.vB.data[i] + (1 - beta2) * g * g;
            
            const mHat = this.mB.data[i] / (1 - Math.pow(beta1, t));
            const vHat = this.vB.data[i] / (1 - Math.pow(beta2, t));
            
            const update = learningRate * mHat / (Math.sqrt(vHat) + eps);
            this.biases.data[i] -= update;
        }
        
        return gradInput;
    }
}

// Neural Network
class NeuralNetwork {
    constructor(layers) {
        this.layers = layers;
        this.t = 1;
    }

    forward(input) {
        let x = input;
        for (const layer of this.layers) {
            x = layer.forward(x);
        }
        return x;
    }

    backward(gradOutput, learningRate) {
        let grad = gradOutput;
        for (let i = this.layers.length - 1; i >= 0; i--) {
            grad = this.layers[i].backward(grad, learningRate, this.t);
        }
        this.t++;
    }

    getParameters() {
        return this.layers.map(l => ({
            weights: l.weights.clone(),
            biases: l.biases.clone()
        }));
    }

    setParameters(params) {
        for (let i = 0; i < this.layers.length; i++) {
            this.layers[i].weights = params[i].weights.clone();
            this.layers[i].biases = params[i].biases.clone();
        }
    }

    softUpdate(otherNetwork, tau) {
        for (let i = 0; i < this.layers.length; i++) {
            const layer = this.layers[i];
            const otherLayer = otherNetwork.layers[i];
            
            for (let j = 0; j < layer.weights.data.length; j++) {
                layer.weights.data[j] = tau * otherLayer.weights.data[j] + 
                                        (1 - tau) * layer.weights.data[j];
            }
            
            for (let j = 0; j < layer.biases.data.length; j++) {
                layer.biases.data[j] = tau * otherLayer.biases.data[j] + 
                                      (1 - tau) * layer.biases.data[j];
            }
        }
    }
}

export { Matrix, Layer, NeuralNetwork, Activations };
