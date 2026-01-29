/**
 * GRAPH ENGINE
 * Handles execution of complex dependency graphs (DAGs).
 * - Topological Sort for execution order.
 * - Parallel execution support (future proofing).
 * - Artifact passing via shared Context.
 */

class GraphEngine {
    constructor() {
        this.executionLog = [];
    }

    /**
     * Executes a graph-based pipeline.
     * @param {Object} graphPipeline - { nodes: [], edges: [] }
     * @param {Function} nodeRunner - async function(node, context) to execute a single node.
     */
    async execute(graphPipeline, nodeRunner) {
        this.executionLog = [];
        const { nodes, edges } = graphPipeline;
        const context = {
            artifacts: {}, // Shared data storage
            results: {},   // Execution results by node ID
            startTime: Date.now()
        };

        console.log("[GraphEngine] Starting execution...");

        // 1. Topological Sort
        const sortedNodes = this._getTopologicalSort(nodes, edges);
        console.log("[GraphEngine] Execution Order:", sortedNodes.map(n => n.data.name));

        // 2. Sequential Execution (Simple Version)
        // In the future, we can group independent nodes for parallel execution.
        let overallStatus = 'SUCCESS';

        for (const node of sortedNodes) {
            console.log(`[GraphEngine] Executing Node: ${node.data.name}`);

            try {
                // Resolve inputs from upstream artifacts if mapped
                const inputs = this._resolveInputs(node, edges, context);

                // Execute Node
                const result = await nodeRunner(node, inputs, context);

                // Store result
                context.results[node.id] = result;

                // Store outputs as artifacts
                if (result.artifacts) {
                    Object.assign(context.artifacts, result.artifacts);
                }

                if (result.status === 'FAILED') {
                    overallStatus = 'FAILURE';
                    if (node.onFailure === 'stop') break;
                }

            } catch (error) {
                console.error(`[GraphEngine] Node Error (${node.data.name}):`, error);
                context.results[node.id] = { status: 'ERROR', error: error.message };
                overallStatus = 'FAILURE';
                break; // Critical failure always stops
            }
        }

        return {
            status: overallStatus,
            duration: Date.now() - context.startTime,
            results: context.results,
            artifacts: context.artifacts
        };
    }

    _getTopologicalSort(nodes, edges) {
        const inDegree = new Map();
        const adj = new Map();

        nodes.forEach(node => {
            inDegree.set(node.id, 0);
            adj.set(node.id, []);
        });

        edges.forEach(edge => {
            const currentIn = inDegree.get(edge.target) || 0;
            inDegree.set(edge.target, currentIn + 1);

            const currentAdj = adj.get(edge.source) || [];
            currentAdj.push(edge.target);
            adj.set(edge.source, currentAdj);
        });

        const queue = [];
        inDegree.forEach((count, id) => {
            if (count === 0) queue.push(id);
        });

        const sorted = [];
        while (queue.length > 0) {
            const u = queue.shift();
            const nodeNode = nodes.find(n => n.id === u);
            if (nodeNode) sorted.push(nodeNode);

            const neighbors = adj.get(u) || [];
            neighbors.forEach(v => {
                const newCount = (inDegree.get(v) || 0) - 1;
                inDegree.set(v, newCount);
                if (newCount === 0) queue.push(v);
            });
        }

        if (sorted.length !== nodes.length) {
            throw new Error("Cycle detected in pipeline! Graph must be Acyclic (DAG).");
        }

        return sorted;
    }

    _resolveInputs(node, edges, context) {
        // Simple Global Artifact Sharing:
        // All downstream nodes have access to all artifacts created so far.
        return context.artifacts;
    }
}

// Export
window.GraphEngine = GraphEngine;
