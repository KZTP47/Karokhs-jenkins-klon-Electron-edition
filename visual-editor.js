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

    /**
     * Clears all nodes and edges, resetting the editor state.
     * Call this before loading a new pipeline to ensure isolation.
     */
    clear() {
        this.nodes = [];
        this.edges = [];
        this.selectedNode = null;
        this.activeConnection = null;
    }

    init() {
        this.container = document.getElementById(this.containerId);
        if (!this.container) throw new Error(`Container ${this.containerId} not found`);

        // Reset state to ensure clean slate for new/different pipeline
        this.clear();

        this.container.innerHTML = '';
        this.container.classList.add('visual-editor-container');

        // Create Top Action Bar for creating new tests
        this._renderTopActionBar();

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

    // Top action bar for creating new tests directly from graph view
    _renderTopActionBar() {
        const actionBar = document.createElement('div');
        actionBar.className = 've-top-action-bar';
        // Changed to floating panel style to avoid overlap and match sidebar design
        actionBar.style.cssText = 'position: absolute; top: 20px; left: 290px; width: fit-content; display: flex; gap: 10px; padding: 10px; background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(10px); border: 1px solid #fff; border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1); z-index: 30; pointer-events: auto; justify-content: flex-start; align-items: center;';

        actionBar.innerHTML = `
            <button id="ve-create-visual-test-btn" class="aero-button-primary py-2 px-4 rounded-lg shadow-lg transition duration-200" style="font-size: 0.9rem;">
                🌐 Create Visual Web Test
            </button>
            <button id="ve-add-test-suite-btn" class="aero-button-success py-2 px-4 rounded-lg shadow-lg transition duration-200" style="font-size: 0.9rem;">
                ➕ Add New Test Suite
            </button>
        `;

        this.container.appendChild(actionBar);

        // Bind button events
        const visualTestBtn = actionBar.querySelector('#ve-create-visual-test-btn');
        if (visualTestBtn) {
            visualTestBtn.onclick = (e) => {
                e.preventDefault();
                console.log("Create Visual Web Test clicked from graph view");
                if (this.onCreateVisualTest) this.onCreateVisualTest();
            };
        }

        const addSuiteBtn = actionBar.querySelector('#ve-add-test-suite-btn');
        if (addSuiteBtn) {
            addSuiteBtn.onclick = (e) => {
                e.preventDefault();
                console.log("Add New Test Suite clicked from graph view");
                if (this.onAddTestSuite) this.onAddTestSuite();
            };
        }
    }

    // Calculate position for a new node (standalone, to the right of existing nodes)
    _calculateNewNodePosition() {
        if (this.nodes.length === 0) {
            return { x: 180, y: 100 };
        }

        // Find the rightmost node
        let maxX = 0;
        let avgY = 0;
        this.nodes.forEach(node => {
            // Check both root x/y (legacy/flat) and position.x/y (nested)
            const x = node.position ? node.position.x : (node.x || 0);
            const y = node.position ? node.position.y : (node.y || 0);

            if (x > maxX) maxX = x;
            avgY += y;
        });
        avgY = avgY / this.nodes.length;

        // Place new node 350px to the right of rightmost node (increased spacing)
        return { x: maxX + 350, y: Math.max(100, avgY) };
    }

    // Add a test suite as a new node in the graph
    addTestNode(suite) {
        if (!suite || !suite.id) {
            console.error("Cannot add test node: invalid suite", suite);
            return;
        }

        const pos = this._calculateNewNodePosition();
        const newNode = {
            id: 'node_' + Date.now(),
            type: 'test',
            // data.name is required by render()
            data: {
                name: suite.name,
                suiteId: suite.id
            },
            position: {
                x: pos.x,
                y: pos.y
            }
        };

        // Ensure nodes array exists
        if (!this.nodes) this.nodes = [];
        this.nodes.push(newNode);

        try {
            this.render();

            console.log(`Added test node for suite: ${suite.name} at position (${pos.x}, ${pos.y})`);
            if (window.showMessage) {
                window.showMessage(`Added "${suite.name}" to graph`, 'success');
            }
        } catch (e) {
            console.error("Error rendering graph after adding node:", e);
        }

        return newNode;
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
                <button id="ve-save-btn" class="aero-button-success" title="Save to current graph">💾 Save</button>
                <button id="ve-saveas-btn" class="aero-button-info" style="margin-left:5px;" title="Save as new graph">📄 Save As</button>
                <button id="ve-run-btn" class="aero-button-primary" style="margin-left:5px;">Run</button>
                <button id="ve-close-btn" class="aero-button-gray">Close</button>
            </div>
            <div class="ve-toolbar-section" style="margin-top:15px;">
                <div class="ve-toolbar-header" style="font-size:0.9rem;">🔒 Security Nodes</div>
                <div id="ve-security-nodes" class="ve-suite-list" style="max-height:90px; min-height:auto;">
                    <div class="ve-palette-item aero-card" draggable="true" data-type="security-scan" 
                         style="background: linear-gradient(180deg, #fecaca 0%, #fca5a5 100%); cursor:grab;">
                        🔍 Security Scan
                    </div>
                    <div class="ve-palette-item aero-card" draggable="true" data-type="security-gate"
                         style="background: linear-gradient(180deg, #fef08a 0%, #fde047 100%); cursor:grab;">
                        🚧 Security Gate
                    </div>
                </div>
            </div>
            <div class="ve-toolbar-section" style="margin-top:15px;">
                <div class="ve-toolbar-header" style="font-size:0.9rem;">🔌 Integrations</div>
                <div id="ve-integration-nodes" class="ve-suite-list" style="max-height:140px; min-height:auto;">
                    <div class="ve-palette-item aero-card" draggable="true" data-type="git-repo" 
                         style="background: linear-gradient(180deg, #fdba74 0%, #fb923c 100%); cursor:grab;">
                        📦 Git Repo
                    </div>
                     <div class="ve-palette-item aero-card" draggable="true" data-type="unit-test-runner" 
                         style="background: linear-gradient(180deg, #ddd6fe 0%, #c4b5fd 100%); cursor:grab;">
                        🧪 Unit Test
                    </div>
                    <div class="ve-palette-item aero-card" draggable="true" data-type="ai-unit-test"
                         style="background: linear-gradient(180deg, #a5f3fc 0%, #06b6d4 100%); cursor:grab;">
                        🤖 AI Unit Test
                    </div>
                </div>
            </div>
            <div class="ve-zoom-controls">
                <button onclick="visualEditor.zoom(0.1)">+</button>
                <button onclick="visualEditor.zoom(-0.1)">-</button>
            </div>
        `;
        this.container.appendChild(toolbar);

        // Bind Save (to current graph)
        const saveBtn = toolbar.querySelector('#ve-save-btn');
        if (saveBtn) {
            saveBtn.onclick = (e) => {
                e.preventDefault();
                console.log("Save clicked");
                if (this.onSave) this.onSave(this.getGraph());
            };
        }

        // Bind Save As (new graph)
        const saveAsBtn = toolbar.querySelector('#ve-saveas-btn');
        if (saveAsBtn) {
            saveAsBtn.onclick = (e) => {
                e.preventDefault();
                console.log("Save As clicked");
                if (this.onSaveAs) this.onSaveAs(this.getGraph());
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

        // Bind drag events for security nodes
        const securityNodes = toolbar.querySelectorAll('#ve-security-nodes [draggable="true"]');
        securityNodes.forEach(node => {
            node.ondragstart = (e) => {
                const nodeType = node.dataset.type;
                e.dataTransfer.setData('application/json', JSON.stringify({
                    type: nodeType,
                    name: node.textContent.trim()
                }));
            };
        });

        // Bind drag events for integration nodes
        const integrationNodes = toolbar.querySelectorAll('#ve-integration-nodes [draggable="true"]');
        integrationNodes.forEach(node => {
            node.ondragstart = (e) => {
                const nodeType = node.dataset.type;
                e.dataTransfer.setData('application/json', JSON.stringify({
                    type: nodeType,
                    name: node.textContent.trim()
                }));
            };
        });
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
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.scale;
        const y = (e.clientY - rect.top) / this.scale;

        if (data.type === 'suite') {
            this.addNode({
                id: 'node_' + Date.now(),
                type: 'job',
                data: { suiteId: data.id, name: data.name },
                position: { x, y }
            });
        } else if (data.type === 'security-scan') {
            this.addNode({
                id: 'node_' + Date.now(),
                type: 'security-scan',
                data: {
                    name: '🔍 Security Scan',
                    scanTypes: ['sast', 'secrets'],
                    failOn: 'critical'
                },
                position: { x, y }
            });
        } else if (data.type === 'security-gate') {
            this.addNode({
                id: 'node_' + Date.now(),
                type: 'security-gate',
                data: {
                    name: '🚧 Security Gate',
                    maxCritical: 0,
                },
                position: { x, y }
            });
        } else if (data.type === 'git-repo') {
            this.addNode({
                id: 'node_' + Date.now(),
                type: 'git-repo',
                data: {
                    name: '📦 Git Repo',
                    repoUrl: '',
                    branch: 'main'
                },
                position: { x, y }
            });
        } else if (data.type === 'unit-test-runner') {
            this.addNode({
                id: 'node_' + Date.now(),
                type: 'unit-test-runner',
                data: {
                    name: '🧪 Unit Test',
                    command: 'npm test',
                    cwd: ''
                },
                position: { x, y }
            });
        } else if (data.type === 'ai-unit-test') {
            this.addNode({
                id: 'node_' + Date.now(),
                type: 'ai-unit-test',
                data: {
                    name: '🤖 AI Unit Test',
                    provider: 'openai',
                    model: '',
                    apiKey: '',
                    customEndpoint: '',
                    instructions: '',
                    testFilename: 'ai-generated-test.js',
                    generatedCode: '',
                    command: 'node ai-generated-test.js',
                    cwd: '',
                    lastGeneratedAt: null
                },
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

            // Apply different styling based on node type
            let headerStyle = '';
            let showRunBtn = true;
            let showConfigBtn = false;

            if (node.type === 'security-scan') {
                headerStyle = 'background: linear-gradient(180deg, #fecaca 0%, #f87171 100%); color: #7f1d1d;';
                showConfigBtn = true;
            } else if (node.type === 'security-gate') {
                headerStyle = 'background: linear-gradient(180deg, #fef08a 0%, #facc15 100%); color: #713f12;';
                showRunBtn = false; // Gates don't run directly
                showConfigBtn = true;
            } else if (node.type === 'git-repo') {
                headerStyle = 'background: linear-gradient(180deg, #fdba74 0%, #fb923c 100%); color: #431407;';
                showConfigBtn = true;
            } else if (node.type === 'unit-test-runner') {
                headerStyle = 'background: linear-gradient(180deg, #ddd6fe 0%, #8b5cf6 100%); color: #4c1d95;';
                showConfigBtn = true;
            } else if (node.type === 'ai-unit-test') {
                headerStyle = 'background: linear-gradient(180deg, #a5f3fc 0%, #06b6d4 100%); color: #164e63;';
                showConfigBtn = true;
            }

            el.innerHTML = `
                <div class="ve-node-header" style="${headerStyle}">
                    <span style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${node.data.name}</span>
                    <div style="display: flex; gap: 4px;">
                        ${showConfigBtn ? `<button class="ve-node-config-btn" title="Configure" onclick="${node.type === 'git-repo' ? 'visualEditor.showGitNodeConfig' : (node.type === 'unit-test-runner' ? 'visualEditor.showUnitTestConfig' : (node.type === 'ai-unit-test' ? 'visualEditor.showAIUnitTestConfig' : 'visualEditor.showSecurityNodeConfig'))}('${node.id}')" style="padding: 2px 6px; font-size: 12px; background: rgba(255,255,255,0.3); border: none; border-radius: 3px; cursor: pointer;">⚙️</button>` : ''}
                        ${showRunBtn ? `<button class="ve-node-run-btn" title="Run this job" onclick="visualEditor.runNode('${node.id}')">▶</button>` : ''}
                    </div>
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

        // Handle security scan nodes
        // Handle security scan nodes
        if (node.type === 'security-scan') {
            this._runSecurityScanNode(node);
            return;
        }

        // Handle git nodes
        if (node.type === 'git-repo') {
            this._runGitNode(node);
            return;
        }

        // Handle AI unit test nodes
        if (node.type === 'ai-unit-test') {
            this._runAIUnitTestNode(node);
            return;
        }

        // Ensure window.runTestSuite exists (from index.html/script.js context)
        if (window.runTestSuite) {
            console.log(`Running node ${node.data.name} (Suite: ${node.data.suiteId})`);
            window.runTestSuite(node.data.suiteId);
        } else {
            alert("Test Runner not initialized!");
        }
    }

    async _runSecurityScanNode(node) {
        console.log('🔍 Running security scan node:', node.data.name);

        // Find all connected input nodes (jobs before this security scan)
        const incomingEdges = this.edges.filter(e => e.target === node.id);
        const sourceNodes = incomingEdges.map(e => this.nodes.find(n => n.id === e.source)).filter(Boolean);

        if (sourceNodes.length === 0) {
            alert('Security Scan requires at least one connected job node as input.');
            return;
        }

        // If security manager exists, run scans
        if (!window.securityManager) {
            alert('Security module not loaded!');
            return;
        }

        // Get code from connected test suites
        const allResults = [];
        for (const sourceNode of sourceNodes) {
            if (sourceNode.type === 'job' && sourceNode.data.suiteId) {
                const suite = window.testStorage?.getSuiteById(sourceNode.data.suiteId);
                if (suite && suite.code) {
                    const result = await window.securityManager.runCodeScan(suite.code, {
                        language: suite.language || 'javascript',
                        scanTypes: node.data.scanTypes || ['sast', 'secrets'],
                        name: `Pipeline Scan: ${sourceNode.data.name}`
                    });
                    allResults.push(result);
                }
            }
        }

        // Aggregate results
        if (allResults.length > 0) {
            const totalVulns = allResults.reduce((sum, r) => sum + r.summary.total, 0);
            const hasFailures = allResults.some(r => !r.policyPassed);

            // Show notification
            if (window.showToast) {
                if (hasFailures) {
                    window.showToast(`❌ Security Scan found ${totalVulns} vulnerabilities - Policy Failed`, 'error');
                } else if (totalVulns > 0) {
                    window.showToast(`⚠️ Security Scan found ${totalVulns} vulnerabilities`, 'warning');
                } else {
                    window.showToast('✅ Security Scan passed - No vulnerabilities found', 'success');
                }
            }

            console.log('Security scan results:', allResults);
        }
    }

    // Show configuration modal for security nodes
    showSecurityNodeConfig(nodeId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;

        // Remove existing config modal if any
        const existingModal = document.getElementById('ve-security-config-modal');
        if (existingModal) existingModal.remove();

        // Create modal
        const modal = document.createElement('div');
        modal.id = 've-security-config-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.6); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
        `;

        let configHTML;
        if (node.type === 'security-scan') {
            // Security Scan configuration
            const config = node.data.config || {};
            configHTML = `
                <div class="aero-modal p-6 rounded-xl max-w-md w-full" style="background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);">
                    <h3 class="text-xl font-bold text-white mb-4">🔒 Security Scan Configuration</h3>
                    
                    <div class="mb-4">
                        <label class="block text-sm text-gray-200 mb-2">Scan Mode</label>
                        <select id="cfg-scan-mode" class="w-full aero-input p-2 rounded-lg" onchange="document.getElementById('cfg-target-wrapper').style.display = this.value === 'code' ? 'none' : 'block'; document.getElementById('cfg-lang-wrapper').style.display = this.value === 'code' ? 'block' : 'none';">
                            <option value="code" ${!config.scanType || config.scanType === 'code' ? 'selected' : ''}>Code Analysis (SAST)</option>
                            <option value="docker_container" ${config.scanType === 'docker_container' ? 'selected' : ''}>Docker Container</option>
                            <option value="docker_image" ${config.scanType === 'docker_image' ? 'selected' : ''}>Docker Image</option>
                            <option value="k8s_yaml" ${config.scanType === 'k8s_yaml' ? 'selected' : ''}>Kubernetes Manifest</option>
                            <option value="network_port" ${config.scanType === 'network_port' ? 'selected' : ''}>Network Port</option>
                        </select>
                    </div>

                    <div id="cfg-lang-wrapper" class="mb-4" style="display: ${!config.scanType || config.scanType === 'code' ? 'block' : 'none'}">
                        <label class="block text-sm text-gray-200 mb-2">Scan Types</label>
                        <div class="space-y-2 mb-3">
                            <label class="flex items-center gap-2">
                                <input type="checkbox" id="cfg-sast" ${config.sast !== false ? 'checked' : ''}>
                                <span class="text-sm text-gray-200">SAST (Code Analysis)</span>
                            </label>
                            <label class="flex items-center gap-2">
                                <input type="checkbox" id="cfg-secrets" ${config.secrets !== false ? 'checked' : ''}>
                                <span class="text-sm text-gray-200">Secrets Detection</span>
                            </label>
                            <label class="flex items-center gap-2">
                                <input type="checkbox" id="cfg-xss" ${config.xss || false ? 'checked' : ''}>
                                <span class="text-sm text-gray-200">XSS Patterns</span>
                            </label>
                        </div>

                        <label class="block text-sm text-gray-200 mb-2">Target Language</label>
                        <select id="cfg-language" class="w-full aero-input p-2 rounded-lg">
                            <option value="javascript" ${config.language === 'javascript' ? 'selected' : ''}>JavaScript</option>
                            <option value="python" ${config.language === 'python' ? 'selected' : ''}>Python</option>
                        </select>
                    </div>

                    <div id="cfg-target-wrapper" class="mb-4" style="display: ${config.scanType && config.scanType !== 'code' ? 'block' : 'none'}">
                        <label class="block text-sm text-gray-200 mb-2">Target (ID/Name/Path/IP:Port)</label>
                        <input type="text" id="cfg-target" value="${config.target || ''}" class="w-full aero-input p-2 rounded-lg" placeholder="e.g. my-container-id or localhost:8080">
                    </div>
                    
                    <div class="mb-6">
                        <label class="flex items-center gap-2">
                            <input type="checkbox" id="cfg-notify" ${config.notify ? 'checked' : ''}>
                            <span class="text-sm text-gray-200">Send notifications on completion</span>
                        </label>
                    </div>
                    
                    <div class="flex gap-2 justify-end">
                        <button id="cfg-cancel" class="aero-button-gray py-2 px-4 rounded-lg">Cancel</button>
                        <button id="cfg-save" class="aero-button-success py-2 px-4 rounded-lg">Save</button>
                    </div>
                </div>
            `;
        } else if (node.type === 'security-gate') {
            // Security Gate configuration
            const config = node.data.config || {};
            configHTML = `
                <div class="aero-modal p-6 rounded-xl max-w-md w-full" style="background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);">
                    <h3 class="text-xl font-bold aero-text-primary mb-4">🚧 Security Gate Configuration</h3>
                    <p class="text-sm aero-text-muted mb-4">Pipeline will fail if vulnerabilities exceed these thresholds:</p>
                    
                    <div class="space-y-4 mb-6">
                        <div>
                            <label class="block text-sm aero-text-secondary mb-1">Max Critical Vulnerabilities</label>
                            <input type="number" id="cfg-max-critical" min="0" value="${config.maxCritical ?? 0}" 
                                class="w-full aero-input p-2 rounded-lg">
                        </div>
                        <div>
                            <label class="block text-sm aero-text-secondary mb-1">Max High Vulnerabilities</label>
                            <input type="number" id="cfg-max-high" min="0" value="${config.maxHigh ?? 5}" 
                                class="w-full aero-input p-2 rounded-lg">
                        </div>
                        <div>
                            <label class="block text-sm aero-text-secondary mb-1">Max Medium Vulnerabilities</label>
                            <input type="number" id="cfg-max-medium" min="0" value="${config.maxMedium ?? 20}" 
                                class="w-full aero-input p-2 rounded-lg">
                        </div>
                    </div>
                    
                    <div class="flex gap-2 justify-end">
                        <button id="cfg-cancel" class="aero-button-gray py-2 px-4 rounded-lg">Cancel</button>
                        <button id="cfg-save" class="aero-button-success py-2 px-4 rounded-lg">Save</button>
                    </div>
                </div>
            `;
        }

        modal.innerHTML = configHTML;
        document.body.appendChild(modal);

        // Event handlers
        const cancelBtn = modal.querySelector('#cfg-cancel');
        cancelBtn.onclick = () => modal.remove();

        const saveBtn = modal.querySelector('#cfg-save');
        saveBtn.onclick = () => {
            // Gather values
            if (node.type === 'security-scan') {
                const scanType = modal.querySelector('#cfg-scan-mode').value;
                node.data = {
                    ...node.data,
                    config: {
                        scanType: scanType,
                        // Code options
                        sast: modal.querySelector('#cfg-sast').checked,
                        secrets: modal.querySelector('#cfg-secrets').checked,
                        xss: modal.querySelector('#cfg-xss').checked,
                        language: modal.querySelector('#cfg-language').value,
                        // Infra options
                        target: modal.querySelector('#cfg-target').value,
                        // Shared
                        notify: modal.querySelector('#cfg-notify').checked
                    }
                };

                // Construct display name based on config
                if (scanType === 'code') node.data.name = '🔍 Security Scan (Code)';
                else if (scanType.includes('docker')) node.data.name = '🐳 ' + scanType;
                else if (scanType.includes('k8s')) node.data.name = '☸️ K8s Scan';
                else if (scanType.includes('network')) node.data.name = '🌐 Net Scan';

            } else if (node.type === 'security-gate') {
                node.data.config = {
                    maxCritical: parseInt(modal.querySelector('#cfg-max-critical').value),
                    maxHigh: parseInt(modal.querySelector('#cfg-max-high').value),
                    maxMedium: parseInt(modal.querySelector('#cfg-max-medium').value)
                };
            }

            this.render(); // Re-render to show updated name
            modal.remove();
            console.log('Updated node config:', node.data);
            // Show confirmation
            if (window.showToast) {
                window.showToast('Configuration saved', 'success');
            }
        };

        // Close on backdrop click
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }

    async showGitNodeConfig(nodeId) {
        console.log('showGitNodeConfig called for:', nodeId);
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;

        // Check if Git is installed
        let isGitInstalled = false;
        try {
            if (window.electronAPI && window.electronAPI.gitOps) {
                isGitInstalled = await window.electronAPI.gitOps.check();
            }
        } catch (e) {
            console.error("Git check failed", e);
        }

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10000]';

        const config = node.data;

        let contentHTML = '';

        if (!isGitInstalled) {
            contentHTML = `
                <div class="text-center">
                    <div class="text-orange-400 mb-4">
                        <svg class="w-16 h-16 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                        <h3 class="text-xl font-bold">Git Not Detected</h3>
                    </div>
                    <p class="text-gray-300 mb-6">Git is required to clone repositories. We can try to install it for you.</p>
                    <button id="cfg-install-git" class="aero-button-primary py-3 px-6 rounded-lg w-full flex items-center justify-center gap-2">
                        ⬇️ Install Git (via Winget)
                    </button>
                    <div id="install-status" class="mt-4 text-sm text-gray-400 hidden">Starting installation...</div>
                </div>
            `;
        } else {
            contentHTML = `
                <h3 class="text-xl font-bold text-white mb-4">📦 Git Repository Configuration</h3>
                
                <div class="space-y-4 mb-6">
                    <div>
                        <label class="block text-sm text-gray-200 mb-1">Repository URL</label>
                        <input type="text" id="cfg-repo-url" value="${config.repoUrl || ''}" 
                            placeholder="https://github.com/user/repo.git"
                            class="w-full aero-input p-2 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-sm text-gray-200 mb-1">Branch</label>
                        <input type="text" id="cfg-branch" value="${config.branch || 'main'}" 
                            placeholder="main"
                            class="w-full aero-input p-2 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-sm text-gray-200 mb-1">Authentication (Optional)</label>
                        <input type="password" id="cfg-auth" value="${config.auth || ''}" placeholder="Personal Access Token (for private repos)"
                            class="w-full aero-input p-2 rounded-lg">
                    </div>
                </div>

                <div class="flex gap-2 justify-end">
                    <button id="cfg-cancel" class="aero-button-gray py-2 px-4 rounded-lg">Cancel</button>
                    <button id="cfg-save" class="aero-button-success py-2 px-4 rounded-lg">Save</button>
                </div>
            `;
        }

        modal.innerHTML = `
            <div class="aero-modal p-6 rounded-xl max-w-md w-full" style="background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);">
                ${contentHTML}
            </div>
        `;
        document.body.appendChild(modal);

        // Handlers
        if (!isGitInstalled) {
            const installBtn = modal.querySelector('#cfg-install-git');
            const statusDiv = modal.querySelector('#install-status');

            // Close button for install dialog
            const closeBtn = document.createElement('button');
            closeBtn.className = 'absolute top-4 right-4 text-gray-400 hover:text-white';
            closeBtn.innerHTML = '×';
            closeBtn.onclick = () => modal.remove();
            modal.firstElementChild.appendChild(closeBtn); // Add to inner modal

            installBtn.onclick = async () => {
                installBtn.disabled = true;
                installBtn.innerHTML = '⏳ Installing...';
                statusDiv.classList.remove('hidden');
                statusDiv.innerText = 'Installing Git... check opened terminal window if prompted.';

                if (!window.electronAPI || !window.electronAPI.gitOps) {
                    statusDiv.innerHTML = '<span class="text-red-400">Error: Desktop App API missing. Please run via "npm start" or Restart the App.</span>';
                    installBtn.innerHTML = '❌ API Error';
                    installBtn.disabled = false;
                    return;
                }

                try {
                    await window.electronAPI.gitOps.install();
                    statusDiv.innerHTML = '<span class="text-green-400">Git installed successfully! Please restart the app.</span>';
                    installBtn.innerHTML = '✅ Installed';
                    setTimeout(() => modal.remove(), 2000);
                } catch (err) {
                    statusDiv.innerHTML = `<span class="text-red-400">Error: ${err.message}. Please install Git manually.</span>`;
                    installBtn.innerHTML = '❌ Failed';
                    installBtn.disabled = false;
                }
            };
        } else {
            modal.querySelector('#cfg-cancel').onclick = () => modal.remove();
            modal.querySelector('#cfg-save').onclick = () => {
                let rawUrl = modal.querySelector('#cfg-repo-url').value.trim();

                // Smart Fix: Handle GitHub file/tree links and extract branch
                // Matches: github.com/user/repo/(blob|tree)/branch/...
                if (rawUrl.includes('github.com')) {
                    const match = rawUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/(blob|tree)\/([^\/]+)/);
                    if (match) {
                        // match[1]=user, [2]=repo, [3]=type, [4]=branch
                        const cleanRepoUrl = `https://github.com/${match[1]}/${match[2]}`;
                        const detectedBranch = match[4];

                        console.log(`Auto-corrected Git URL: ${rawUrl} -> ${cleanRepoUrl}`);

                        rawUrl = cleanRepoUrl;

                        // Auto-fill branch if user hasn't typed a custom one (or is default 'main')
                        const branchInput = modal.querySelector('#cfg-branch');
                        if (branchInput && (branchInput.value === 'main' || branchInput.value === '')) {
                            branchInput.value = detectedBranch;
                            if (window.showToast) window.showToast(`ℹ️ Detected branch: ${detectedBranch}`, 'info');
                        }

                        if (window.showToast) window.showToast('ℹ️ Auto-corrected URL to Repository Root', 'info');
                    }
                }

                node.data.repoUrl = rawUrl;
                node.data.branch = modal.querySelector('#cfg-branch').value;
                node.data.auth = modal.querySelector('#cfg-auth').value;
                node.data.name = `📦 ${node.data.repoUrl.split('/').pop() || 'Git Repo'}`;

                this.render();
                modal.remove();
                if (window.showToast) window.showToast('Git config saved', 'success');
            };
        }

        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }

    async _runGitNode(node) {
        if (!node.data.repoUrl) {
            alert('Please configure Repository URL first.');
            return;
        }

        if (window.showToast) window.showToast(`⏳ Cloning ${node.data.name}...`, 'info');
        console.log(`Cloning ${node.data.repoUrl}...`);

        try {
            const result = await window.electronAPI.gitOps.clone(node.data.repoUrl, node.data.branch, node.data.auth);
            console.log('Clone Result:', result);
            node.data.clonedPath = result.path;
            if (window.showToast) window.showToast(`✅ Cloned to ${result.path}`, 'success');
        } catch (err) {
            console.error(err);
            if (window.showToast) window.showToast(`❌ Clone Failed: ${err.message}`, 'error');
        }
    }

    showUnitTestConfig(nodeId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10000]';

        const config = node.data;

        modal.innerHTML = `
            <div class="aero-modal p-6 rounded-xl max-w-2xl w-full flex flex-col max-h-[90vh]" style="background: linear-gradient(180deg, #2e1065 0%, #170736 100%); border: 1px solid rgba(139, 92, 246, 0.5);">
                <h3 class="text-xl font-bold text-white mb-4">🧪 Unit Test Injection</h3>
                
                <div class="space-y-4 mb-6 flex-1 overflow-y-auto">
                    <!-- Filename -->
                    <div>
                        <label class="block text-sm text-gray-200 mb-1">Test Filename (to inject)</label>
                        <input type="text" id="cfg-filename" value="${config.testFilename || 'custom-test.js'}" 
                            placeholder="e.g. custom-test.js"
                            class="w-full aero-input p-2 rounded-lg font-mono text-sm" style="background: rgba(255,255,255,0.1); color: white; border-color: rgba(255,255,255,0.2);">
                    </div>

                    <!-- Code Editor -->
                    <div class="flex-1 flex flex-col">
                        <label class="block text-sm text-gray-200 mb-1">Test Code</label>
                        <textarea id="cfg-code" class="w-full h-64 aero-input p-3 rounded-lg font-mono text-sm" 
                            style="background: #0f172a; color: #a5b4fc; border-color: rgba(139, 92, 246, 0.3);"
                            placeholder="// Write your test code here\n// It will be saved to the repo folder before running the command.\n\nconst fs = require('fs');\nconsole.log('Running test...');">${config.testCode || ''}</textarea>
                    </div>

                    <!-- Command -->
                    <div>
                        <label class="block text-sm text-gray-200 mb-1">Execution Command</label>
                        <input type="text" id="cfg-command" value="${config.command || 'node custom-test.js'}" 
                            placeholder="e.g. node custom-test.js"
                            class="w-full aero-input p-2 rounded-lg font-mono text-sm" style="background: rgba(255,255,255,0.1); color: white; border-color: rgba(255,255,255,0.2);">
                        <p class="text-xs text-gray-400 mt-1">This command is executed in the repo root after injecting the file.</p>
                    </div>
                </div>

                <div class="flex gap-2 justify-end mt-auto pt-4 border-t border-gray-700">
                    <button id="cfg-cancel" class="aero-button-gray py-2 px-4 rounded-lg">Cancel</button>
                    <button id="cfg-save" class="aero-button-success py-2 px-4 rounded-lg">Save Configuration</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };

        modal.querySelector('#cfg-cancel').onclick = () => modal.remove();
        modal.querySelector('#cfg-save').onclick = () => {
            const filename = modal.querySelector('#cfg-filename').value.trim();
            const code = modal.querySelector('#cfg-code').value;
            const cmd = modal.querySelector('#cfg-command').value.trim();

            node.data.testFilename = filename;
            node.data.testCode = code;
            node.data.command = cmd;

            node.data.name = `🧪 ${filename}`; // Update node label to show filename

            this.render();
            modal.remove();
            if (window.showToast) window.showToast('Test injection config saved', 'success');
        };
    }

    showAIUnitTestConfig(nodeId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10000]';

        const config = node.data;

        // Determine which provider options to show as selected
        const providerOptions = ['openai', 'anthropic', 'google', 'custom'].map(p => {
            const labels = { openai: 'OpenAI', anthropic: 'Anthropic (Claude)', google: 'Google (Gemini)', custom: 'Custom (OpenAI-compatible)' };
            return `<option value="${p}" ${config.provider === p ? 'selected' : ''} style="color: black; background: white;">${labels[p]}</option>`;
        }).join('');

        modal.innerHTML = `
            <div class="aero-modal p-6 rounded-xl max-w-2xl w-full flex flex-col max-h-[90vh]" style="background: linear-gradient(180deg, #083344 0%, #042f2e 100%); border: 1px solid rgba(6, 182, 212, 0.5);">
                <h3 class="text-xl font-bold text-white mb-4">🤖 AI powered unit tester</h3>

                <div class="space-y-4 mb-6 flex-1 overflow-y-auto" style="padding-right: 8px;">
                    <!-- Test Filename -->
                    <div>
                        <label class="block text-sm text-gray-200 mb-1">Test file name (to inject)</label>
                        <input type="text" id="cfg-ai-filename" value="${config.testFilename || 'ai-generated-test.js'}"
                            placeholder="e.g. ai-generated-test.js"
                            class="w-full aero-input p-2 rounded-lg font-mono text-sm" style="background: rgba(255,255,255,0.1); color: white; border-color: rgba(255,255,255,0.2);">
                    </div>

                    <!-- AI Provider -->
                    <div>
                        <label class="block text-sm text-gray-200 mb-1">AI model</label>
                        <select id="cfg-ai-provider" class="w-full aero-input p-2 rounded-lg text-sm" style="background: rgba(255,255,255,0.1); color: white; border-color: rgba(255,255,255,0.2);">
                            ${providerOptions}
                        </select>
                    </div>

                    <!-- Model Name -->
                    <div id="cfg-ai-model-group">
                        <label class="block text-sm text-gray-200 mb-1">Model name <span class="text-gray-400">(optional -- defaults will be used if empty)</span></label>
                        <input type="text" id="cfg-ai-model" value="${config.model || ''}"
                            placeholder="e.g. gpt-4o, claude-sonnet-4-20250514, gemini-2.5-flash"
                            class="w-full aero-input p-2 rounded-lg font-mono text-sm" style="background: rgba(255,255,255,0.1); color: white; border-color: rgba(255,255,255,0.2);">
                    </div>

                    <!-- Custom Endpoint (only visible when provider=custom) -->
                    <div id="cfg-ai-endpoint-group" style="display: ${config.provider === 'custom' ? 'block' : 'none'};">
                        <label class="block text-sm text-gray-200 mb-1">Custom API endpoint</label>
                        <input type="text" id="cfg-ai-endpoint" value="${config.customEndpoint || ''}"
                            placeholder="https://your-api.example.com/v1/chat/completions"
                            class="w-full aero-input p-2 rounded-lg font-mono text-sm" style="background: rgba(255,255,255,0.1); color: white; border-color: rgba(255,255,255,0.2);">
                    </div>

                    <!-- Max Tokens -->
                    <div>
                        <label class="block text-sm text-gray-200 mb-1">Max tokens (output limit)</label>
                        <input type="number" id="cfg-ai-max-tokens" value="${config.maxTokens || 16384}"
                            min="1024" max="65536" step="1024"
                            placeholder="16384"
                            class="w-full aero-input p-2 rounded-lg font-mono text-sm" style="background: rgba(255,255,255,0.1); color: white; border-color: rgba(255,255,255,0.2);">
                        <p class="text-xs text-gray-400 mt-1">Higher values = longer tests but more API cost. If tests get cut off mid-code, increase this.</p>
                    </div>

                    <!-- API Key -->
                    <div>
                        <label class="block text-sm text-gray-200 mb-1">API Key</label>
                        <input type="password" id="cfg-ai-apikey" value="${config.apiKey || ''}"
                            placeholder="sk-..."
                            class="w-full aero-input p-2 rounded-lg font-mono text-sm" style="background: rgba(255,255,255,0.1); color: white; border-color: rgba(255,255,255,0.2);">
                    </div>

                    <!-- Source Code from Git Repo -->
                    <div>
                        <label class="block text-sm text-gray-200 mb-1">Source code from connected Git Repo</label>
                        <div id="cfg-ai-source-area" class="rounded-lg p-3" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); min-height: 60px;">
                            <div id="cfg-ai-source-status" class="text-xs text-gray-400 mb-2">
                                Click "Load files from repo" to scan the connected Git Repo node for source files.
                            </div>
                            <button id="cfg-ai-load-files" class="py-1 px-3 rounded text-xs font-semibold"
                                style="background: rgba(6, 182, 212, 0.3); color: #a5f3fc; border: 1px solid rgba(6, 182, 212, 0.4); cursor: pointer;">
                                Load files from repo
                            </button>
                            <div id="cfg-ai-file-list" class="mt-2" style="max-height: 150px; overflow-y: auto;"></div>
                            <p class="text-xs text-gray-500 mt-1">Selected files will be included in the AI prompt so it can generate tests based on your actual source code.</p>
                        </div>
                    </div>

                    <!-- Instructions -->
                    <div>
                        <label class="block text-sm text-gray-200 mb-1">Instructions given to AI</label>
                        <textarea id="cfg-ai-instructions" class="w-full h-32 aero-input p-3 rounded-lg text-sm"
                            style="background: rgba(255,255,255,0.08); color: #a5f3fc; border-color: rgba(6, 182, 212, 0.3);"
                            placeholder="Describe what you want to test. For example:\n\n- Test the login function in auth.js\n- Cover edge cases like empty passwords, SQL injection attempts\n- Use Jest as the testing framework\n- Mock the database connection">${config.instructions || ''}</textarea>
                    </div>

                    <!-- Generate Button -->
                    <div class="flex items-center gap-3">
                        <button id="cfg-ai-generate" class="py-2 px-4 rounded-lg font-semibold text-sm"
                            style="background: linear-gradient(180deg, #06b6d4, #0891b2); color: white; border: none; cursor: pointer;">
                            Generate Tests with AI
                        </button>
                        <span id="cfg-ai-status" class="text-xs text-gray-400"></span>
                    </div>

                    <!-- Generated Code Display -->
                    <div>
                        <label class="block text-sm text-gray-200 mb-1">Unit-Test Code generated</label>
                        <textarea id="cfg-ai-code" class="w-full h-64 aero-input p-3 rounded-lg font-mono text-sm"
                            style="background: #0f172a; color: #67e8f9; border-color: rgba(6, 182, 212, 0.3);"
                            placeholder="AI-generated test code will appear here after clicking 'Generate Tests with AI'.\nYou can also manually edit the code.">${config.generatedCode || ''}</textarea>
                    </div>

                    <!-- Execution Command -->
                    <div>
                        <label class="block text-sm text-gray-200 mb-1">Execution command</label>
                        <input type="text" id="cfg-ai-command" value="${config.command || 'node ai-generated-test.js'}"
                            placeholder="e.g. node ai-generated-test.js, npx jest ai-generated-test.js"
                            class="w-full aero-input p-2 rounded-lg font-mono text-sm" style="background: rgba(255,255,255,0.1); color: white; border-color: rgba(255,255,255,0.2);">
                        <p class="text-xs text-gray-400 mt-1">This command runs in the repo root after injecting the test file.</p>
                    </div>
                </div>

                <div class="flex gap-2 justify-end mt-auto pt-4 border-t border-gray-700">
                    <button id="cfg-ai-cancel" class="aero-button-gray py-2 px-4 rounded-lg">Cancel</button>
                    <button id="cfg-ai-save" class="py-2 px-4 rounded-lg font-semibold" style="background: linear-gradient(180deg, #06b6d4, #0891b2); color: white; border: none; cursor: pointer;">save</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Show/hide custom endpoint field based on provider selection
        const providerSelect = modal.querySelector('#cfg-ai-provider');
        const endpointGroup = modal.querySelector('#cfg-ai-endpoint-group');
        providerSelect.addEventListener('change', () => {
            endpointGroup.style.display = providerSelect.value === 'custom' ? 'block' : 'none';
        });

        // -- Source file loading logic --
        // This tracks which files the user has loaded/selected from the connected Git Repo
        let loadedSourceFiles = []; // Array of { path: string, content: string, selected: boolean }

        // Helper: find connected Git Repo node
        const findConnectedGitRepo = () => {
            const incomingEdges = this.edges.filter(e => e.target === nodeId);
            for (const edge of incomingEdges) {
                const sourceNode = this.nodes.find(n => n.id === edge.source);
                if (sourceNode && sourceNode.type === 'git-repo' && sourceNode.data.clonedPath) {
                    return sourceNode;
                }
            }
            return null;
        };

        // Load files button handler
        modal.querySelector('#cfg-ai-load-files').onclick = async () => {
            const statusEl = modal.querySelector('#cfg-ai-source-status');
            const fileListEl = modal.querySelector('#cfg-ai-file-list');
            const loadBtn = modal.querySelector('#cfg-ai-load-files');

            const gitRepoNode = findConnectedGitRepo();
            if (!gitRepoNode) {
                statusEl.textContent = 'ERROR: No connected Git Repo node found. Connect a Git Repo node to this AI Unit Test node first, then clone the repo.';
                statusEl.style.color = '#f87171';
                return;
            }

            const repoPath = gitRepoNode.data.clonedPath;
            loadBtn.disabled = true;
            loadBtn.textContent = 'Scanning...';
            statusEl.textContent = `Scanning ${repoPath}...`;
            statusEl.style.color = '#a5f3fc';

            try {
                // Use electronAPI to list all source files in the cloned repo
                // List common source file extensions
                const allFiles = await window.electronAPI.fileOps.listFiles(repoPath);

                // Filter to likely source code files (not binaries, not node_modules, not .git)
                const sourceExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cs', 'go', 'rb', 'php', 'c', 'cpp', 'h', 'rs', 'swift', 'kt', 'scala', 'vue', 'svelte', 'mjs', 'cjs'];
                const sourceFiles = allFiles.filter(f => {
                    const ext = f.split('.').pop().toLowerCase();
                    return sourceExtensions.includes(ext);
                });

                if (sourceFiles.length === 0) {
                    statusEl.textContent = 'WARNING: No source code files found in the repo.';
                    statusEl.style.color = '#fbbf24';
                    loadBtn.disabled = false;
                    loadBtn.textContent = 'Load files from repo';
                    return;
                }

                statusEl.textContent = `Found ${sourceFiles.length} source file(s). Select the ones you want the AI to analyze:`;
                statusEl.style.color = '#4ade80';

                // Render checkbox list of files
                // Show paths relative to repo root for readability
                fileListEl.innerHTML = sourceFiles.map((filePath, index) => {
                    const relativePath = filePath.replace(repoPath, '').replace(/^[\\/]/, '');
                    return `
                        <label class="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/5 cursor-pointer text-xs text-gray-200" style="display:flex;">
                            <input type="checkbox" class="cfg-ai-file-cb" data-index="${index}" data-path="${filePath}" checked>
                            <span class="font-mono">${relativePath}</span>
                        </label>
                    `;
                }).join('');

                // Store file paths for later reading
                loadedSourceFiles = sourceFiles.map(f => ({ path: f, selected: true, content: null }));

            } catch (err) {
                console.error('File scanning error:', err);
                statusEl.textContent = `ERROR: Error scanning repo: ${err.message}`;
                statusEl.style.color = '#f87171';
            } finally {
                loadBtn.disabled = false;
                loadBtn.textContent = 'Reload files from repo';
            }
        };

        // Generate button handler
        modal.querySelector('#cfg-ai-generate').onclick = async () => {
            const provider = modal.querySelector('#cfg-ai-provider').value;
            const model = modal.querySelector('#cfg-ai-model').value.trim();
            const apiKey = modal.querySelector('#cfg-ai-apikey').value.trim();
            const instructions = modal.querySelector('#cfg-ai-instructions').value.trim();
            const filename = modal.querySelector('#cfg-ai-filename').value.trim();
            const customEndpoint = modal.querySelector('#cfg-ai-endpoint').value.trim();
            const statusEl = modal.querySelector('#cfg-ai-status');
            const codeEl = modal.querySelector('#cfg-ai-code');
            const generateBtn = modal.querySelector('#cfg-ai-generate');

            if (!apiKey) {
                statusEl.textContent = 'ERROR: API Key is required';
                statusEl.style.color = '#f87171';
                return;
            }
            if (!instructions) {
                statusEl.textContent = 'ERROR: Instructions are required';
                statusEl.style.color = '#f87171';
                return;
            }

            // -- Read selected source files from the repo --
            // Update selection state from checkboxes
            const checkboxes = modal.querySelectorAll('.cfg-ai-file-cb');
            checkboxes.forEach(cb => {
                const idx = parseInt(cb.dataset.index);
                if (loadedSourceFiles[idx]) {
                    loadedSourceFiles[idx].selected = cb.checked;
                }
            });

            const selectedFiles = loadedSourceFiles.filter(f => f.selected);
            let sourceCodeContext = '';

            // Warn user if no source files are loaded — AI will hallucinate
            if (selectedFiles.length === 0) {
                const proceed = confirm(
                    'WARNING: No source files loaded!\n\n' +
                    'Without source code, the AI will generate generic/hypothetical tests that probably won\'t work.\n\n' +
                    'Click "Cancel" to go back and click "Load files from repo" first.\n' +
                    'Click "OK" to generate anyway (not recommended).'
                );
                if (!proceed) {
                    return;
                }
            }

            if (selectedFiles.length > 0) {
                statusEl.textContent = `Reading ${selectedFiles.length} source file(s)...`;
                statusEl.style.color = '#a5f3fc';

                try {
                    // Read each selected file's content via Electron API
                    for (const file of selectedFiles) {
                        if (!file.content) {
                            file.content = await window.electronAPI.fileOps.readFile(file.path);
                        }
                    }

                    // Build the source code context block for the AI prompt
                    const gitRepoNode = findConnectedGitRepo();
                    const repoPath = gitRepoNode ? gitRepoNode.data.clonedPath : '';

                    sourceCodeContext = '\n\n--- SOURCE CODE FROM REPOSITORY ---\n' +
                        selectedFiles.map(f => {
                            const relativePath = f.path.replace(repoPath, '').replace(/^[\\/]/, '');
                            return `\n=== FILE: ${relativePath} ===\n${f.content}\n`;
                        }).join('') +
                        '\n--- END OF SOURCE CODE ---\n';
                } catch (err) {
                    console.error('Error reading source files:', err);
                    statusEl.textContent = `WARNING: Could not read some source files: ${err.message}. Generating without source context.`;
                    statusEl.style.color = '#fbbf24';
                    sourceCodeContext = '';
                }
            }

            // Build the system prompt for test generation
            const systemPrompt = `You are an expert test engineer. Generate comprehensive unit test code based on the user's instructions and the provided source code.

CRITICAL RULES:
1. Generate STANDALONE Node.js tests using ONLY the built-in "assert" module (require('assert') or require('node:assert')).
   DO NOT use Jest, Mocha, Vitest, or any external testing framework. The test file must be runnable with "node ${filename}" directly.
2. Structure your test file like this:
   - require('assert') at the top
   - require/import the source module(s) using CORRECT RELATIVE PATHS (the test file will be in the repo root)
   - Define test functions, each wrapped in try/catch that prints PASS or FAIL
   - At the bottom, run all tests and print a summary (X passed, Y failed)
3. Generate tests covering ALL of the following categories:
   - HAPPY PATH: Standard expected usage with valid inputs that should succeed
   - GOLDEN PATH: The ideal/optimal usage path through the system
   - EDGE CASES: Boundary values, empty inputs, maximum values, type coercion, Unicode, special characters
   - NEGATIVE PATH: Invalid inputs, error conditions, unauthorized access, malformed data, expected failures
4. Each test must have a clear, descriptive name indicating what it tests and which category it belongs to.
5. The code must be a COMPLETE, RUNNABLE file. Do not use markdown fences. Output ONLY valid code.
6. The test file name will be: ${filename}
7. Add a comment header summarizing the test coverage.
8. If source code files are provided below, analyze them CAREFULLY and generate tests that SPECIFICALLY target the actual functions, classes, exports, and logic found in those files. DO NOT invent hypothetical modules. Use the real function names, real parameter signatures, and real module paths from the provided source code.
9. If NO source code is provided, generate tests based solely on the user's instructions. Clearly state in a comment that no source was provided.
10. NEVER generate tests for imaginary or hypothetical code. Only test what actually exists in the provided source files.

Example test structure:
const assert = require('assert');
const myModule = require('./src/myModule'); // real path from source

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS: ' + name); }
  catch(e) { failed++; console.log('  FAIL: ' + name + ' - ' + e.message); }
}

test('should add two numbers [HAPPY PATH]', () => { assert.strictEqual(myModule.add(1,2), 3); });
// ... more tests ...

console.log('\\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);

Output ONLY the test code. No explanations, no markdown, no fences. Just valid, runnable code.`;

            // Build the user prompt -- include source code context if available
            const userPrompt = instructions + sourceCodeContext;

            // Disable button, show loading
            generateBtn.disabled = true;
            generateBtn.textContent = 'Generating...';
            statusEl.textContent = 'Calling AI API...';
            statusEl.style.color = '#a5f3fc';

            try {
                // Check if electronAPI is available (running in Electron)
                if (window.electronAPI && window.electronAPI.aiOps) {
                    const maxTokens = parseInt(modal.querySelector('#cfg-ai-max-tokens').value) || 16384;
                    const result = await window.electronAPI.aiOps.generate(
                        provider, model, apiKey, userPrompt, systemPrompt, customEndpoint, maxTokens
                    );
                    if (result.success && result.generatedText) {
                        // Strip markdown code fences if the AI included them despite instructions
                        let code = result.generatedText;
                        code = code.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '').trim();
                        codeEl.value = code;
                        statusEl.textContent = `Generated successfully at ${new Date().toLocaleTimeString()}`;
                        statusEl.style.color = '#4ade80';
                    } else {
                        statusEl.textContent = 'ERROR: No code was generated';
                        statusEl.style.color = '#f87171';
                    }
                } else {
                    // Fallback for browser-only testing (non-Electron)
                    // Use fetch directly (will hit CORS issues but useful for development)
                    statusEl.textContent = 'ERROR: AI operations require the Electron desktop app';
                    statusEl.style.color = '#f87171';
                }
            } catch (err) {
                console.error('AI Generation Error:', err);
                statusEl.textContent = `ERROR: ${err.message || err}`;
                statusEl.style.color = '#f87171';
            } finally {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate Tests with AI';
            }
        };

        // Close modal on backdrop click
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };

        // Cancel button
        modal.querySelector('#cfg-ai-cancel').onclick = () => modal.remove();

        // Save button
        modal.querySelector('#cfg-ai-save').onclick = () => {
            const filename = modal.querySelector('#cfg-ai-filename').value.trim();

            node.data.testFilename = filename;
            node.data.provider = modal.querySelector('#cfg-ai-provider').value;
            node.data.model = modal.querySelector('#cfg-ai-model').value.trim();
            node.data.apiKey = modal.querySelector('#cfg-ai-apikey').value.trim();
            node.data.customEndpoint = modal.querySelector('#cfg-ai-endpoint').value.trim();
            node.data.instructions = modal.querySelector('#cfg-ai-instructions').value;
            node.data.generatedCode = modal.querySelector('#cfg-ai-code').value;
            node.data.command = modal.querySelector('#cfg-ai-command').value.trim();
            node.data.maxTokens = parseInt(modal.querySelector('#cfg-ai-max-tokens').value) || 16384;

            node.data.name = `🤖 AI: ${filename}`;

            this.render();
            modal.remove();
            if (window.showToast) window.showToast('AI Unit Test config saved', 'success');
        };
    }

    async _runAIUnitTestNode(node) {
        console.log('[AI Unit Test] Running node:', node.data.name);

        const config = node.data;

        // Validate: must have generated code
        if (!config.generatedCode || config.generatedCode.trim() === '') {
            if (window.showToast) window.showToast('No test code generated yet. Open config and generate tests first.', 'error');
            return;
        }

        // Determine working directory
        // Try to find a connected Git Repo node upstream to get the cloned repo path
        let cwd = config.cwd;
        if (!cwd) {
            const incomingEdges = this.edges.filter(e => e.target === node.id);
            for (const edge of incomingEdges) {
                const sourceNode = this.nodes.find(n => n.id === edge.source);
                if (sourceNode && sourceNode.type === 'git-repo' && sourceNode.data.clonedPath) {
                    cwd = sourceNode.data.clonedPath;
                    break;
                }
            }
        }

        if (!cwd) {
            if (window.showToast) window.showToast('No working directory set. Connect a Git Repo node or set CWD in config.', 'error');
            return;
        }

        try {
            if (window.showToast) window.showToast('Injecting test file...', 'info');

            // 1. Write the generated test file to the working directory
            const testFilePath = cwd.replace(/\\/g, '/') + '/' + config.testFilename;
            await window.electronAPI.fileOps.writeFile(testFilePath, config.generatedCode);
            console.log('Test file written to:', testFilePath);

            // 2. Execute the test command
            if (window.showToast) window.showToast('Running AI-generated tests...', 'info');
            const result = await window.electronAPI.sysOps.runCommand(cwd, config.command || `node ${config.testFilename}`);

            console.log('Test Result:', result);

            if (result.exitCode === 0) {
                if (window.showToast) window.showToast(`AI Tests Passed.\n${result.stdout.slice(0, 200)}`, 'success');
            } else {
                if (window.showToast) window.showToast(`AI Tests Failed (exit code ${result.exitCode}):\n${(result.stderr || result.stdout).slice(0, 300)}`, 'error');
            }

            // Store result on node for graph engine context sharing
            node.data.lastResult = {
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr,
                timestamp: new Date().toISOString()
            };

        } catch (err) {
            console.error('AI Unit Test execution error:', err);
            if (window.showToast) window.showToast(`Execution Error: ${err.message}`, 'error');
        }
    }

    zoom(delta) {
        // Implementation for zoom transform on this.canvas
    }
}

window.VisualEditor = VisualEditor;
window.visualEditor = new VisualEditor('visual-editor-root'); // Default
