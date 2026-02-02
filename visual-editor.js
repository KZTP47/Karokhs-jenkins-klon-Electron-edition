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
                <div id="ve-integration-nodes" class="ve-suite-list" style="max-height:90px; min-height:auto;">
                    <div class="ve-palette-item aero-card" draggable="true" data-type="git-repo" 
                         style="background: linear-gradient(180deg, #fdba74 0%, #fb923c 100%); cursor:grab;">
                        📦 Git Repo
                    </div>
                     <div class="ve-palette-item aero-card" draggable="true" data-type="unit-test-runner" 
                         style="background: linear-gradient(180deg, #ddd6fe 0%, #c4b5fd 100%); cursor:grab;">
                        🧪 Unit Test
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
            }

            el.innerHTML = `
                <div class="ve-node-header" style="${headerStyle}">
                    <span style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${node.data.name}</span>
                    <div style="display: flex; gap: 4px;">
                        ${showConfigBtn ? `<button class="ve-node-config-btn" title="Configure" onclick="${node.type === 'git-repo' ? 'visualEditor.showGitNodeConfig' : (node.type === 'unit-test-runner' ? 'visualEditor.showUnitTestConfig' : 'visualEditor.showSecurityNodeConfig')}('${node.id}')" style="padding: 2px 6px; font-size: 12px; background: rgba(255,255,255,0.3); border: none; border-radius: 3px; cursor: pointer;">⚙️</button>` : ''}
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

    zoom(delta) {
        // Implementation for zoom transform on this.canvas
    }
}

window.VisualEditor = VisualEditor;
window.visualEditor = new VisualEditor('visual-editor-root'); // Default
