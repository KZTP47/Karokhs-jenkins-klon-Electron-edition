/**
 * VISUAL PIPELINE EDITOR
 * Standalone module for editing Graph-based pipelines.
 * Uses HTML Nodes + SVG Connections.
 */

class VisualEditor {
    constructor(containerId) {
        this.containerId = containerId;
        this.nodes = [];
        this.edges = [];
        this.scale = 1;
        this.panning = { x: 0, y: 0 };
        this.selectedNode = null;
        this.activeConnection = null; // { sourceNodeId, currentX, currentY }

        // DOM Elements
        this.container = null;
        this.canvas = null;
        this.svgLayer = null;
        this.nodeLayer = null;

        // Callbacks
        this.onSave = null;
        this.availableSuites = []; // Populate with test suites to drag in
    }

    init() {
        this.container = document.getElementById(this.containerId);
        if (!this.container) throw new Error(`Container ${this.containerId} not found`);

        this.container.innerHTML = '';
        this.container.classList.add('visual-editor-container');

        // Create Layers
        this.canvas = document.createElement('div');
        this.canvas.className = 've-canvas';

        // SVG Layer for lines (z-index: 0)
        this.svgLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svgLayer.classList.add('ve-svg-layer');
        this.svgLayer.style.width = '100%';
        this.svgLayer.style.height = '100%';
        this.svgLayer.style.position = 'absolute';
        this.svgLayer.style.top = '0';
        this.svgLayer.style.left = '0';
        this.svgLayer.style.pointerEvents = 'none'; // Click through lines

        // Node Layer (z-index: 1)
        this.nodeLayer = document.createElement('div');
        this.nodeLayer.className = 've-node-layer';

        this.canvas.appendChild(this.svgLayer);
        this.canvas.appendChild(this.nodeLayer);
        this.container.appendChild(this.canvas);

        // Sidebar for Tools (Optional, can be external)
        this._renderToolbar();

        // Event Listeners
        this._bindEvents();
    }

    loadGraph(graphData) {
        this.nodes = graphData.nodes || [];
        this.edges = graphData.edges || [];
        this.render();
    }

    getGraph() {
        return {
            nodes: this.nodes,
            edges: this.edges
        };
    }

    _renderToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 've-toolbar aero-glass-panel';
        toolbar.innerHTML = `
            <div class="ve-toolbar-header">Available Suites</div>
            <div id="ve-suite-list" class="ve-suite-list"></div>
            <div class="ve-toolbar-btn-group">
                <button id="ve-save-btn" class="aero-button-success">Save</button>
                <button id="ve-run-btn" class="aero-button-primary" style="margin-left:5px;">Run</button>
                <button id="ve-close-btn" class="aero-button-gray">Close</button>
            </div>
            <div class="ve-zoom-controls">
                <button onclick="visualEditor.zoom(0.1)">+</button>
                <button onclick="visualEditor.zoom(-0.1)">-</button>
            </div>
        `;
        this.container.appendChild(toolbar);

        // Bind Save/Close/Run using locally scoped queries to avoid ID conflicts if cleanup fails
        const saveBtn = toolbar.querySelector('#ve-save-btn');
        if (saveBtn) {
            saveBtn.onclick = (e) => {
                e.preventDefault();
                console.log("Save clicked");
                if (this.onSave) this.onSave(this.getGraph());
            };
        }

        const runBtn = toolbar.querySelector('#ve-run-btn');
        if (runBtn) {
            runBtn.onclick = (e) => {
                e.preventDefault();
                console.log("Run clicked");
                if (this.onRun) this.onRun(this.getGraph());
            };
        }

        const closeBtn = toolbar.querySelector('#ve-close-btn');
        if (closeBtn) {
            closeBtn.onclick = (e) => {
                e.preventDefault();
                this.container.innerHTML = '';
                this.container.classList.add('hidden');
            };
        }
    }

    setAvailableSuites(suites) {
        this.availableSuites = suites;
        const list = document.getElementById('ve-suite-list');
        if (!list) return;

        list.innerHTML = '';
        suites.forEach(suite => {
            const item = document.createElement('div');
            item.className = 've-palette-item aero-card';
            item.draggable = true;
            item.innerText = suite.name;
            item.dataset.suiteId = suite.id;

            item.ondragstart = (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({
                    type: 'suite',
                    id: suite.id,
                    name: suite.name
                }));
            };

            list.appendChild(item);
        });
    }

    _bindEvents() {
        // Drag Over / Drop on Canvas
        this.canvas.ondragover = (e) => e.preventDefault();
        this.canvas.ondrop = (e) => this._handleDrop(e);

        // Mouse Move for dragging nodes or connections
        this.container.onmousemove = (e) => this._handleMouseMove(e);
        this.container.onmouseup = (e) => this._handleMouseUp(e);

        // Zoom/Pan (simplified)
    }

    _handleDrop(e) {
        e.preventDefault();
        const raw = e.dataTransfer.getData('application/json');
        if (!raw) return;

        const data = JSON.parse(raw);
        if (data.type === 'suite') {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / this.scale;
            const y = (e.clientY - rect.top) / this.scale;

            this.addNode({
                id: 'node_' + Date.now(),
                type: 'job',
                data: { suiteId: data.id, name: data.name },
                position: { x, y }
            });
        }
    }

    addNode(node) {
        this.nodes.push(node);
        this.render();
    }

    render() {
        // Clear layers
        this.nodeLayer.innerHTML = '';
        this.svgLayer.innerHTML = ''; // Basic clear

        // Render Nodes
        this.nodes.forEach(node => {
            const el = document.createElement('div');
            el.className = 've-node aero-card';
            el.style.left = `${node.position.x}px`;
            el.style.top = `${node.position.y}px`;
            el.dataset.id = node.id;

            el.innerHTML = `
                <div class="ve-node-header">
                    <span style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${node.data.name}</span>
                    <button class="ve-node-run-btn" title="Run this job" onclick="visualEditor.runNode('${node.id}')">▶</button>
                </div>
                <div class="ve-ports">
                    <div class="ve-port ve-input-port"></div>
                    <div class="ve-port ve-output-port"></div>
                </div>
                <button class="ve-delete-node" onclick="visualEditor.deleteNode('${node.id}')">×</button>
            `;

            // Drag Logic for Node
            el.onmousedown = (e) => this._startNodeDrag(e, node);

            // Connect Logic
            const outPort = el.querySelector('.ve-output-port');
            outPort.onmousedown = (e) => {
                e.stopPropagation(); // Don't drag node
                this._startConnection(e, node);
            };

            const inPort = el.querySelector('.ve-input-port');
            inPort.onmouseup = (e) => {
                e.stopPropagation();
                this._finishConnection(e, node);
            };

            this.nodeLayer.appendChild(el);
        });

        // Render Edges
        this.edges.forEach(edge => {
            this._drawEdge(edge);
        });
    }

    _drawEdge(edge) {
        const sourceNode = this.nodes.find(n => n.id === edge.source);
        const targetNode = this.nodes.find(n => n.id === edge.target);
        if (!sourceNode || !targetNode) return;

        // Simple bezier
        const sx = sourceNode.position.x + 300; // Width of node approx (matched with CSS width)
        const sy = sourceNode.position.y + 25;  // Height/2 approx (header middle) - adjusted to match port visual
        const tx = targetNode.position.x;
        const ty = targetNode.position.y + 25;

        const controlOffset = Math.abs(tx - sx) * 0.5;
        const d = `M ${sx} ${sy} C ${sx + controlOffset} ${sy}, ${tx - controlOffset} ${ty}, ${tx} ${ty}`;

        // Create a wider invisible path for easier clicking/hovering
        const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        hitPath.setAttribute("d", d);
        hitPath.setAttribute("stroke", "transparent");
        hitPath.setAttribute("stroke-width", "20"); // Thick hit area
        hitPath.setAttribute("fill", "none");
        hitPath.style.cursor = 'pointer';
        hitPath.style.pointerEvents = 'stroke'; // FORCE interaction despite parent none

        // Visual path
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("stroke", "#5e6ad2");
        path.setAttribute("stroke-width", "3");
        path.setAttribute("fill", "none");
        path.style.pointerEvents = "none";

        // Calculate Midpoint for Delete Button
        const midX = (sx + tx) / 2;
        const midY = (sy + ty) / 2;

        // Delete Button Group
        const deleteGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        deleteGroup.style.cursor = "pointer";
        deleteGroup.style.pointerEvents = "all"; // Ensure clickable

        // Simple Red Circle
        const btnCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        btnCircle.setAttribute("cx", midX);
        btnCircle.setAttribute("cy", midY);
        btnCircle.setAttribute("r", "10");
        btnCircle.setAttribute("fill", "#dc3545"); // Stronger red
        btnCircle.setAttribute("stroke", "white");
        btnCircle.setAttribute("stroke-width", "2");

        // 'X' Icon
        const btnText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        btnText.setAttribute("x", midX);
        btnText.setAttribute("y", midY);
        btnText.setAttribute("text-anchor", "middle");
        btnText.setAttribute("dominant-baseline", "central");
        btnText.setAttribute("fill", "white");
        btnText.setAttribute("font-size", "14px");
        btnText.setAttribute("font-weight", "bold");
        btnText.textContent = "×";
        btnText.style.pointerEvents = "none"; // Pass to group

        deleteGroup.appendChild(btnCircle);
        deleteGroup.appendChild(btnText);

        const onDelete = (e) => {
            e.stopPropagation();
            if (confirm('Delete this connection?')) {
                this.edges = this.edges.filter(ed => ed.id !== edge.id);
                this.render();
            }
        };

        deleteGroup.onclick = onDelete;
        hitPath.ondblclick = onDelete; // Double click connection to delete as well

        // Hover Effect
        const highlight = () => {
            path.setAttribute("stroke", "#dc3545");
            btnCircle.setAttribute("r", "12"); // Scale up slightly
        };
        const reset = () => {
            path.setAttribute("stroke", "#5e6ad2");
            btnCircle.setAttribute("r", "10");
        };

        hitPath.onmouseover = highlight;
        hitPath.onmouseout = reset;
        deleteGroup.onmouseover = highlight;
        deleteGroup.onmouseout = reset;

        this.svgLayer.appendChild(path);
        this.svgLayer.appendChild(hitPath);
        this.svgLayer.appendChild(deleteGroup);
    }

    _startNodeDrag(e, node) {
        if (e.target.tagName === 'BUTTON') return;
        this.selectedNode = node;
        this.dragOffset = {
            x: e.clientX - node.position.x,
            y: e.clientY - node.position.y
        };
    }

    _handleMouseMove(e) {
        if (this.selectedNode) {
            // Move Node
            this.selectedNode.position.x = e.clientX - this.dragOffset.x;
            this.selectedNode.position.y = e.clientY - this.dragOffset.y;
            this.render(); // Re-render edges
        } else if (this.activeConnection) {
            // Draw Temp Line
            const rect = this.canvas.getBoundingClientRect();
            // Calculate mouse position relative to canvas (taking scale into account if needed)
            const mx = (e.clientX - rect.left) / this.scale;
            const my = (e.clientY - rect.top) / this.scale;

            const sx = this.activeConnection.startX;
            const sy = this.activeConnection.startY;

            // Draw Bezier to mouse
            const controlOffset = Math.abs(mx - sx) * 0.5;
            const d = `M ${sx} ${sy} C ${sx + controlOffset} ${sy}, ${mx - controlOffset} ${my}, ${mx} ${my}`;

            if (this.activeConnection.tempLine) {
                this.activeConnection.tempLine.setAttribute("d", d);
            }
        }
    }

    _handleMouseUp(e) {
        this.selectedNode = null;
        if (this.activeConnection) {
            // Cancel connection if dropped on nothing
            if (this.activeConnection.tempLine) {
                this.activeConnection.tempLine.remove();
            }
            this.activeConnection = null;
        }
    }

    _startConnection(e, node) {
        // Calculate start position (Right port)
        // Since node position is top-left, we approximated width=300 in CSS
        // Let's get exact position if possible, but for now rely on node position assumption
        const startX = node.position.x + 300;
        const startY = node.position.y + 40; // Approx middle of header+body start

        // Create temp SVG line
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("stroke", "#5e6ad2");
        path.setAttribute("stroke-width", "3");
        path.setAttribute("stroke-dasharray", "5,5"); // Dashed for temp
        path.setAttribute("fill", "none");
        path.setAttribute("opacity", "0.6");
        path.style.pointerEvents = "none";

        this.svgLayer.appendChild(path);

        this.activeConnection = {
            source: node,
            startX: startX,
            startY: startY,
            tempLine: path
        };
    }

    _finishConnection(e, targetNode) {
        if (!this.activeConnection) return;
        if (this.activeConnection.source.id === targetNode.id) return; // No self loops

        // Cleanup temp line
        if (this.activeConnection.tempLine) {
            this.activeConnection.tempLine.remove();
        }

        // create edge
        this.edges.push({
            id: 'edge_' + Date.now(),
            source: this.activeConnection.source.id,
            target: targetNode.id
        });

        this.activeConnection = null;
        this.render();
    }

    deleteNode(id) {
        this.nodes = this.nodes.filter(n => n.id !== id);
        this.edges = this.edges.filter(e => e.source !== id && e.target !== id);
        this.render();
    }

    runNode(id) {
        const node = this.nodes.find(n => n.id === id);
        if (!node) return;

        // Ensure window.runTestSuite exists (from index.html/script.js context)
        if (window.runTestSuite) {
            console.log(`Running node ${node.data.name} (Suite: ${node.data.suiteId})`);
            window.runTestSuite(node.data.suiteId);
        } else {
            alert("Test Runner not initialized!");
        }
    }

    zoom(delta) {
        // Implementation for zoom transform on this.canvas
    }
}

window.VisualEditor = VisualEditor;
window.visualEditor = new VisualEditor('visual-editor-root'); // Default
