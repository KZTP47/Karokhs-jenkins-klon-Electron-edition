
/**
 * PIPELINE MANAGER
 * Orchestrates the chaining of test suites into automated workflows.
 * Supports multiple scripts per step (stage).
 */

let pipelines = [];
let currentEditingPipeline = null;
let pipelineStages = []; // Renamed from 'steps' to 'stages' for internal clarity
let selectedStageIndex = null;

function initializePipelineManager() {
    loadPipelines();
    renderPipelinesList();
    console.log("Pipeline Manager Initialized");
}

function loadPipelines() {
    try {
        const stored = localStorage.getItem('lvx_pipelines');
        pipelines = stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error("Error loading pipelines", e);
        pipelines = [];
    }
}

function savePipelines() {
    localStorage.setItem('lvx_pipelines', JSON.stringify(pipelines));
}

function renderPipelinesList() {
    const container = document.getElementById('pipelines-list');
    if (!container) return;

    container.innerHTML = '';

    if (pipelines.length === 0) {
        container.innerHTML = `
            <div class="text-center p-4">
                <p class="text-xs aero-text-muted mb-2">No pipelines yet.</p>
                <div class="flex gap-2 justify-center">
                    <button onclick="openPipelineEditor()" class="aero-button-success text-xs py-1 px-2 rounded">
                        + New Linear Pipeline
                    </button>
                    <button onclick="openVisualPipelineEditor()" class="aero-button-purple text-xs py-1 px-2 rounded">
                        + New Graph Pipeline
                    </button>
                </div>
            </div>`;
        return;
    }

    // Header Actions
    if (!document.getElementById('pipeline-header-actions')) {
        const headerMsg = document.createElement('div');
        headerMsg.id = 'pipeline-header-actions';
        headerMsg.className = 'flex justify-end gap-2 mb-2 px-2';
        headerMsg.innerHTML = `
            <button onclick="openVisualPipelineEditor()" class="text-xs text-purple-600 hover:text-purple-800" title="New Graph Pipeline">+ Graph</button>
         `;
        container.parentNode.insertBefore(headerMsg, container);
    }

    pipelines.forEach(pipeline => {
        const div = document.createElement('div');
        div.className = 'aero-button p-2 rounded text-sm flex justify-between items-center mb-1 hover:shadow';
        div.innerHTML = `
            <div class="truncate font-semibold flex-1 cursor-pointer" onclick="runPipeline('${pipeline.id}')">
                <span class="text-xs text-purple-600 mr-1">${pipeline.type === 'graph' ? '🕸️' : '⚡'}</span>${escapeHtml(pipeline.name)}
            </div>
            <div class="flex gap-1">
                <button onclick="editPipeline('${pipeline.id}')" class="text-blue-600 hover:text-blue-800 px-1" title="Edit">✎</button>
                <button onclick="deletePipeline('${pipeline.id}')" class="text-red-600 hover:text-red-800 px-1" title="Delete">×</button>
            </div>
        `;
        container.appendChild(div);
    });
}

// --- PIPELINE EDITOR ---

function openPipelineEditor() {
    currentEditingPipeline = null;
    pipelineStages = [];
    selectedStageIndex = null;

    document.getElementById('pipeline-name').value = '';
    document.getElementById('pipeline-id').value = '';
    document.getElementById('pipeline-description').value = '';

    renderPipelineStages();
    populateAvailableSuites();

    document.getElementById('pipeline-editor-modal').classList.remove('hidden');
}

function editPipeline(id) {
    const pipeline = pipelines.find(p => p.id === id);
    if (!pipeline) return;

    if (pipeline.type === 'graph') {
        openVisualPipelineEditor(id);
        return;
    }

    currentEditingPipeline = pipeline;
    // Deep copy stages to avoid mutating original during edit cancel
    pipelineStages = JSON.parse(JSON.stringify(pipeline.stages || []));

    // Migration for old single-step format if necessary
    if (pipelineStages.length > 0 && !pipelineStages[0].actions) {
        pipelineStages = pipelineStages.map(oldStep => ({
            id: oldStep.id,
            name: oldStep.suiteName || "Legacy Step",
            onSuccess: oldStep.onSuccess,
            onFailure: oldStep.onFailure,
            actions: [{ suiteId: oldStep.suiteId, suiteName: oldStep.suiteName }]
        }));
    }

    selectedStageIndex = pipelineStages.length > 0 ? 0 : null;

    document.getElementById('pipeline-name').value = pipeline.name;
    document.getElementById('pipeline-id').value = pipeline.id;
    document.getElementById('pipeline-description').value = pipeline.description || '';

    renderPipelineStages();
    populateAvailableSuites();

    document.getElementById('pipeline-editor-modal').classList.remove('hidden');
}

function closePipelineEditor() {
    document.getElementById('pipeline-editor-modal').classList.add('hidden');
}

function populateAvailableSuites() {
    const container = document.getElementById('pipeline-available-suites');
    container.innerHTML = '';

    if (!window.testSuites || window.testSuites.length === 0) {
        container.innerHTML = `
            <div class="text-center p-4 bg-yellow-50 rounded border border-yellow-200">
                <p class="text-xs text-yellow-700 mb-2">No Test Suites found.</p>
                <button onclick="closePipelineEditor(); openAddSuiteModal()" class="aero-button-success text-xs py-1 px-2 rounded">
                    + Create your first Test Suite
                </button>
            </div>
        `;
        return;
    }

    window.testSuites.forEach(suite => {
        const div = document.createElement('div');
        div.className = 'aero-card p-2 cursor-pointer hover:bg-blue-50 transition flex items-center gap-2 draggable-suite';
        div.setAttribute('draggable', 'true');

        // Add click handler as alternative to drag
        div.onclick = () => addActionToSelectedStage(suite);

        div.innerHTML = `
            <div class="w-2 h-2 rounded-full bg-blue-400"></div>
            <div class="text-sm font-medium truncate flex-1">${escapeHtml(suite.name)}</div>
            <div class="text-xs text-gray-400 uppercase">${suite.language.substring(0, 3)}</div>
            <button class="text-xs bg-blue-100 text-blue-600 px-1 rounded hover:bg-blue-200" title="Add to active stage">+</button>
        `;
        container.appendChild(div);
    });
}

function addNewStageToPipeline() {
    const stage = {
        id: 'stage_' + Date.now(),
        name: `Stage ${pipelineStages.length + 1}`,
        onSuccess: 'next',
        onFailure: 'stop',
        actions: [] // Array of suites to run
    };
    pipelineStages.push(stage);
    selectedStageIndex = pipelineStages.length - 1;
    renderPipelineStages();
}

function addActionToSelectedStage(suite) {
    if (selectedStageIndex === null) {
        // If no stage selected, create one
        addNewStageToPipeline();
    }

    const stage = pipelineStages[selectedStageIndex];
    stage.actions.push({
        id: 'action_' + Date.now(),
        suiteId: suite.id,
        suiteName: suite.name
    });
    renderPipelineStages();
}

function removeStage(index) {
    pipelineStages.splice(index, 1);
    if (selectedStageIndex === index) selectedStageIndex = null;
    if (selectedStageIndex > index) selectedStageIndex--;
    renderPipelineStages();
}

function removeAction(stageIndex, actionIndex) {
    pipelineStages[stageIndex].actions.splice(actionIndex, 1);
    renderPipelineStages();
}

function selectStage(index) {
    selectedStageIndex = index;
    renderPipelineStages();
}

function updateStageLogic(index, type, value) {
    pipelineStages[index][type] = value;
}

function updateStageName(index, value) {
    pipelineStages[index].name = value;
}

function moveStage(index, direction) {
    if (direction === 'up' && index > 0) {
        [pipelineStages[index], pipelineStages[index - 1]] = [pipelineStages[index - 1], pipelineStages[index]];
        if (selectedStageIndex === index) selectedStageIndex--;
        else if (selectedStageIndex === index - 1) selectedStageIndex++;
    } else if (direction === 'down' && index < pipelineStages.length - 1) {
        [pipelineStages[index], pipelineStages[index + 1]] = [pipelineStages[index + 1], pipelineStages[index]];
        if (selectedStageIndex === index) selectedStageIndex++;
        else if (selectedStageIndex === index + 1) selectedStageIndex--;
    }
    renderPipelineStages();
}

function renderPipelineStages() {
    const container = document.getElementById('pipeline-stages-container');
    const emptyMsg = document.getElementById('pipeline-empty-msg');

    container.innerHTML = '';

    if (pipelineStages.length === 0) {
        emptyMsg.classList.remove('hidden');
        return;
    }
    emptyMsg.classList.add('hidden');

    pipelineStages.forEach((stage, index) => {
        const isSelected = index === selectedStageIndex;
        const div = document.createElement('div');
        div.className = `pipeline-step bg-white p-4 rounded shadow border-l-4 relative transition-all ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300 opacity-90'}`;
        div.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
                selectStage(index);
            }
        };

        // Build Actions HTML
        let actionsHtml = '';
        if (stage.actions.length === 0) {
            actionsHtml = '<div class="text-xs text-gray-400 italic p-2 border border-dashed border-gray-300 rounded text-center">No scripts added. Click items on left to add.</div>';
        } else {
            stage.actions.forEach((action, aIndex) => {
                actionsHtml += `
                    <div class="flex justify-between items-center bg-gray-50 p-2 rounded border border-gray-200 mb-1 text-sm">
                        <span class="truncate flex-1">📄 ${escapeHtml(action.suiteName)}</span>
                        <button onclick="removeAction(${index}, ${aIndex})" class="text-red-400 hover:text-red-600 font-bold px-2">×</button>
                    </div>
                `;
            });
        }

        div.innerHTML = `
            <div class="absolute top-2 right-2 flex gap-1">
                <button onclick="moveStage(${index}, 'up')" class="text-gray-400 hover:text-blue-600" ${index === 0 ? 'disabled' : ''}>▲</button>
                <button onclick="moveStage(${index}, 'down')" class="text-gray-400 hover:text-blue-600" ${index === pipelineStages.length - 1 ? 'disabled' : ''}>▼</button>
                <button onclick="removeStage(${index})" class="text-red-400 hover:text-red-600 ml-2">🗑</button>
            </div>
            
            <div class="mb-3 pr-16">
                <input type="text" value="${escapeHtml(stage.name)}" 
                    onchange="updateStageName(${index}, this.value)"
                    class="font-bold text-lg bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none w-full"
                    placeholder="Stage Name">
            </div>

            <div class="mb-3">
                <h5 class="text-xs font-bold text-gray-500 uppercase mb-1">Scripts / Test Suites</h5>
                <div class="space-y-1 max-h-32 overflow-y-auto">
                    ${actionsHtml}
                </div>
            </div>

            <div class="flex gap-4 mt-3 text-xs border-t pt-2">
                <div class="flex-1">
                    <label class="block text-green-600 font-medium mb-1">On Success</label>
                    <select class="w-full border rounded p-1 bg-green-50" onchange="updateStageLogic(${index}, 'onSuccess', this.value)">
                        <option value="next" ${stage.onSuccess === 'next' ? 'selected' : ''}>Run Next Stage</option>
                        <option value="stop" ${stage.onSuccess === 'stop' ? 'selected' : ''}>Stop Pipeline</option>
                    </select>
                </div>
                <div class="flex-1">
                    <label class="block text-red-600 font-medium mb-1">On Failure</label>
                    <select class="w-full border rounded p-1 bg-red-50" onchange="updateStageLogic(${index}, 'onFailure', this.value)">
                        <option value="stop" ${stage.onFailure === 'stop' ? 'selected' : ''}>Stop Pipeline</option>
                        <option value="next" ${stage.onFailure === 'next' ? 'selected' : ''}>Continue Anyway</option>
                    </select>
                </div>
            </div>
            ${index < pipelineStages.length - 1 ?
                '<div class="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-gray-400 text-xl">↓</div>' : ''}
        `;
        container.appendChild(div);
    });
}

function savePipeline() {
    const name = document.getElementById('pipeline-name').value;
    const desc = document.getElementById('pipeline-description').value;

    if (!name) {
        alert("Pipeline name is required");
        return;
    }
    if (pipelineStages.length === 0) {
        alert("Pipeline must have at least one stage");
        return;
    }

    // Validate empty stages
    const emptyStage = pipelineStages.find(s => s.actions.length === 0);
    if (emptyStage) {
        alert(`Stage "${emptyStage.name}" has no scripts. Please add scripts or remove the stage.`);
        return;
    }

    const pipeline = {
        id: currentEditingPipeline ? currentEditingPipeline.id : 'pipe_' + Date.now(),
        name: name,
        description: desc,
        stages: pipelineStages,
        lastRun: null,
        lastStatus: 'NEVER_RUN'
    };

    if (currentEditingPipeline) {
        const idx = pipelines.findIndex(p => p.id === pipeline.id);
        if (idx !== -1) pipelines[idx] = pipeline;
    } else {
        pipelines.push(pipeline);
    }

    savePipelines();
    renderPipelinesList();
    closePipelineEditor();
    window.showMessage("Pipeline saved successfully", 'success');
}

function deletePipeline(id) {
    if (confirm("Delete this pipeline?")) {
        pipelines = pipelines.filter(p => p.id !== id);
        savePipelines();
        renderPipelinesList();
    }
}

// --- PIPELINE RUNNER (ADVANCED) ---

async function runPipeline(id) {
    const pipeline = pipelines.find(p => p.id === id);
    if (!pipeline) return;

    if (pipeline.type === 'graph') {
        runGraphPipeline(pipeline);
        return;
    }

    const modal = document.getElementById('pipeline-run-modal');
    const title = document.getElementById('run-pipeline-name');
    const stepsContainer = document.getElementById('pipeline-execution-steps');
    const consoleOutput = document.getElementById('pipeline-console-output');
    const statusBadge = document.getElementById('pipeline-overall-status');

    title.textContent = pipeline.name;
    stepsContainer.innerHTML = '';
    consoleOutput.innerHTML = `<span class="text-gray-400">Initializing execution of pipeline: ${pipeline.name}...</span><br>`;
    statusBadge.className = "px-3 py-1 rounded-full text-sm font-bold bg-blue-100 text-blue-600";
    statusBadge.innerText = "RUNNING";

    // Render Pipeline Structure in Runner Modal
    pipeline.stages.forEach((stage, sIdx) => {
        const stageDiv = document.createElement('div');
        stageDiv.id = `exec-stage-${sIdx}`;
        stageDiv.className = 'mb-4';

        let jobsHtml = '';
        stage.actions.forEach((action, aIdx) => {
            jobsHtml += `
                <div id="exec-stage-${sIdx}-action-${aIdx}" class="ml-4 mt-2 p-2 bg-white border border-gray-200 rounded flex justify-between items-center text-sm">
                    <div class="flex items-center gap-2">
                        <span class="text-gray-400 text-xs">Job ${aIdx + 1}</span>
                        <span class="font-medium">${escapeHtml(action.suiteName)}</span>
                    </div>
                    <span class="status-text text-xs text-gray-500">WAITING</span>
                </div>
            `;
        });

        stageDiv.innerHTML = `
            <div class="p-3 bg-gray-100 rounded border border-gray-300 flex justify-between items-center stage-header">
                <div class="font-bold text-gray-700">Step ${sIdx + 1}: ${escapeHtml(stage.name)}</div>
                <div class="stage-status text-xs px-2 py-1 rounded bg-gray-200 text-gray-600">PENDING</div>
            </div>
            <div class="jobs-container border-l-2 border-gray-200 ml-3 pl-0">
                ${jobsHtml}
            </div>
        `;
        stepsContainer.appendChild(stageDiv);
    });

    modal.classList.remove('hidden');

    // Execution Loop
    let overallStatus = 'SUCCESS';

    for (let i = 0; i < pipeline.stages.length; i++) {
        const stage = pipeline.stages[i];
        const stageEl = document.getElementById(`exec-stage-${i}`);
        const stageHeader = stageEl.querySelector('.stage-header');
        const stageBadge = stageEl.querySelector('.stage-status');

        // Update Stage UI to Running
        stageHeader.className = 'p-3 bg-blue-50 border border-blue-300 rounded flex justify-between items-center shadow stage-header transition-all';
        stageBadge.className = 'stage-status text-xs px-2 py-1 rounded bg-blue-500 text-white';
        stageBadge.innerHTML = 'RUNNING <span class="spinner w-3 h-3 border-white ml-1"></span>';

        consoleOutput.innerHTML += `<br><span class="text-blue-400 font-bold">>>> Executing Stage ${i + 1}: ${stage.name}</span><br>`;
        consoleOutput.scrollTop = consoleOutput.scrollHeight;

        stageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        let stageSuccess = true;

        // Run all actions in this stage sequentially (Local JS is single threaded anyway)
        for (let j = 0; j < stage.actions.length; j++) {
            const action = stage.actions[j];
            const actionEl = document.getElementById(`exec-stage-${i}-action-${j}`);
            const actionStatus = actionEl.querySelector('.status-text');

            actionEl.className = "ml-4 mt-2 p-2 bg-blue-50 border border-blue-200 rounded flex justify-between items-center text-sm shadow-sm";
            actionStatus.className = "status-text text-xs text-blue-600 font-bold";
            actionStatus.innerText = "RUNNING...";

            consoleOutput.innerHTML += `<span class="text-gray-300 ml-4">- Running job: ${action.suiteName}...</span>`;

            try {
                // Use window.runTestSuite for local execution
                const result = await window.runTestSuite(action.suiteId, true); // true = silent mode

                if (result.status === 'SUCCESS') {
                    actionEl.className = "ml-4 mt-2 p-2 bg-green-50 border border-green-200 rounded flex justify-between items-center text-sm";
                    actionStatus.className = "status-text text-xs text-green-600 font-bold";
                    actionStatus.innerText = "✓ PASS";
                    consoleOutput.innerHTML += ` <span class="text-green-400">PASS</span><br>`;
                } else if (result.status === 'PENDING') {
                    // Handle Visual Web Runner Hand-off
                    actionEl.className = "ml-4 mt-2 p-2 bg-purple-50 border border-purple-200 rounded flex justify-between items-center text-sm";
                    actionStatus.innerText = "↗ VISUAL RUNNER";
                    consoleOutput.innerHTML += ` <span class="text-purple-400">Opened Visual Runner</span><br>`;
                    // We don't fail the pipeline for visual runner, but we can't track it fully here
                } else {
                    actionEl.className = "ml-4 mt-2 p-2 bg-red-50 border border-red-200 rounded flex justify-between items-center text-sm";
                    actionStatus.className = "status-text text-xs text-red-600 font-bold";
                    actionStatus.innerText = "✗ FAIL";
                    consoleOutput.innerHTML += ` <span class="text-red-500">FAIL</span><br>`;
                    consoleOutput.innerHTML += `<span class="text-red-300 text-xs ml-6">${result.log.substring(0, 200)}...</span><br>`;
                    stageSuccess = false;
                }

            } catch (err) {
                console.error(err);
                actionEl.className = "ml-4 mt-2 p-2 bg-red-100 border border-red-300 rounded flex justify-between items-center text-sm";
                actionStatus.innerText = "ERROR";
                consoleOutput.innerHTML += ` <span class="text-red-600">ERROR: ${err.message}</span><br>`;
                stageSuccess = false;
            }
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }

        // Evaluate Stage Result
        if (stageSuccess) {
            stageHeader.className = 'p-3 bg-green-50 border border-green-300 rounded flex justify-between items-center stage-header';
            stageBadge.className = 'stage-status text-xs px-2 py-1 rounded bg-green-500 text-white';
            stageBadge.innerText = 'COMPLETED';

            if (stage.onSuccess === 'stop') {
                consoleOutput.innerHTML += `<br><span class="text-yellow-400">INFO: Logic [Success -> Stop] triggered. Stopping pipeline.</span><br>`;
                break;
            }
        } else {
            stageHeader.className = 'p-3 bg-red-50 border border-red-300 rounded flex justify-between items-center stage-header';
            stageBadge.className = 'stage-status text-xs px-2 py-1 rounded bg-red-500 text-white';
            stageBadge.innerText = 'FAILED';

            if (stage.onFailure === 'stop') {
                consoleOutput.innerHTML += `<br><span class="text-red-500 font-bold">CRITICAL: Stage Failed. Logic [Failure -> Stop] triggered. Aborting pipeline.</span><br>`;
                overallStatus = 'FAILURE';
                break;
            } else {
                consoleOutput.innerHTML += `<br><span class="text-yellow-400">WARNING: Stage Failed. Logic [Failure -> Next] triggered. Continuing...</span><br>`;
                overallStatus = 'WARNING';
            }
        }
    }

    consoleOutput.innerHTML += `<br><span class="text-white font-bold border-t border-gray-600 pt-2 block">Pipeline Execution Finished. Final Status: ${overallStatus}</span>`;
    consoleOutput.scrollTop = consoleOutput.scrollHeight;

    // Final Status Badge Update
    if (overallStatus === 'SUCCESS') {
        statusBadge.className = "px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-600";
        statusBadge.innerText = "SUCCESS";
    } else if (overallStatus === 'WARNING') {
        statusBadge.className = "px-3 py-1 rounded-full text-sm font-bold bg-yellow-100 text-yellow-600";
        statusBadge.innerText = "WARNINGS";
    } else {
        statusBadge.className = "px-3 py-1 rounded-full text-sm font-bold bg-red-100 text-red-600";
        statusBadge.innerText = "FAILURE";
    }

    // Update Pipeline Metadata
    pipeline.lastRun = new Date().toISOString();
    pipeline.lastStatus = overallStatus;
    savePipelines();
}

function closePipelineRunModal() {
    document.getElementById('pipeline-run-modal').classList.add('hidden');
}


// --- GRAPH PIPELINE LOGIC ---

function openVisualPipelineEditor(pipelineId = null) {
    const root = document.getElementById('visual-editor-root');
    root.classList.remove('hidden');

    // Ensure Visual Editor is initialized
    if (!window.visualEditor) {
        window.visualEditor = new window.VisualEditor('visual-editor-root');
    }
    window.visualEditor.init();

    // Populate Available Suites
    if (window.testSuites) {
        window.visualEditor.setAvailableSuites(window.testSuites);
    }

    if (pipelineId) {
        const pipeline = pipelines.find(p => p.id === pipelineId);
        if (pipeline && pipeline.type === 'graph') {
            window.visualEditor.loadGraph({ nodes: pipeline.nodes || [], edges: pipeline.edges || [] });
            window._editingGraphPipelineId = pipelineId;
        } else {
            // Pipeline exists but is not a graph type - show empty canvas
            window.visualEditor.render();
            window._editingGraphPipelineId = null;
        }
    } else {
        // New pipeline - ensure empty canvas is rendered
        window.visualEditor.render();
        window._editingGraphPipelineId = null;
    }

    // Hook Save (to current graph) - saves directly if editing, prompts if new
    window.visualEditor.onSave = (graphData) => {
        const existingId = window._editingGraphPipelineId;

        if (existingId) {
            // Editing existing pipeline - save directly without prompting for name
            const existingPipeline = pipelines.find(p => p.id === existingId);
            const pipeline = {
                id: existingId,
                name: existingPipeline ? existingPipeline.name : 'Graph Pipeline',
                type: 'graph',
                nodes: graphData.nodes,
                edges: graphData.edges,
                lastRun: existingPipeline ? existingPipeline.lastRun : null,
                lastStatus: existingPipeline ? existingPipeline.lastStatus : 'NEVER_RUN'
            };

            const idx = pipelines.findIndex(p => p.id === existingId);
            if (idx !== -1) pipelines[idx] = pipeline;

            savePipelines();
            renderPipelinesList();
            root.classList.add('hidden');
            window.showMessage("Graph Pipeline Saved", "success");
        } else {
            // New pipeline - prompt for name
            window.showInputModal("Enter Pipeline Name", "My Graph Pipeline", (name) => {
                if (!name) return;

                const id = 'pipe_graph_' + Date.now();
                const pipeline = {
                    id: id,
                    name: name,
                    type: 'graph',
                    nodes: graphData.nodes,
                    edges: graphData.edges,
                    lastRun: null,
                    lastStatus: 'NEVER_RUN'
                };

                pipelines.push(pipeline);
                window._editingGraphPipelineId = id; // Set as current editing

                savePipelines();
                renderPipelinesList();
                root.classList.add('hidden');
                window.showMessage("Graph Pipeline Created", "success");
            });
        }
    };

    // Hook Save As (always creates new graph with new name)
    window.visualEditor.onSaveAs = (graphData) => {
        window.showInputModal("Enter Name for New Pipeline", "My Graph Pipeline Copy", (name) => {
            if (!name) return;

            const id = 'pipe_graph_' + Date.now();
            const pipeline = {
                id: id,
                name: name,
                type: 'graph',
                nodes: graphData.nodes,
                edges: graphData.edges,
                lastRun: null,
                lastStatus: 'NEVER_RUN'
            };

            pipelines.push(pipeline);
            window._editingGraphPipelineId = id; // Now editing this new pipeline

            savePipelines();
            renderPipelinesList();
            root.classList.add('hidden');
            window.showMessage("Graph Pipeline Saved as New", "success");
        });
    };

    // Hook Close (Already handled by inner UI, but ensure sync)

    // Hook Run
    window.visualEditor.onRun = (graphData) => {
        const executeRun = (id, name) => {
            const pipeline = {
                id: id,
                name: name,
                type: 'graph',
                nodes: graphData.nodes,
                edges: graphData.edges,
                lastRun: null,
                lastStatus: 'NEVER_RUN'
            };

            // Update or Push
            const idx = pipelines.findIndex(p => p.id === id);
            if (idx !== -1) pipelines[idx] = pipeline;
            else pipelines.push(pipeline);

            savePipelines();
            renderPipelinesList();

            // Hide editor and run
            root.classList.add('hidden');
            runGraphPipeline(pipeline);
        };

        // Check if existing
        let id = window._editingGraphPipelineId;

        if (!id) {
            window.showInputModal("Enter Pipeline Name to Run", "My Graph Pipeline", (name) => {
                if (!name) return;
                id = 'pipe_graph_' + Date.now();
                executeRun(id, name);
            });
        } else {
            const existing = pipelines.find(p => p.id === id);
            const name = existing ? existing.name : "Graph Pipeline";
            executeRun(id, name);
        }
    };

    // Hook Create Visual Web Test button - opens the Visual Web Tester modal
    window.visualEditor.onCreateVisualTest = () => {
        // Set flag to indicate graph view is active for adding node after save
        window._graphViewActiveForNewTest = true;

        if (typeof openVisualWebTester === 'function') {
            openVisualWebTester();
        } else {
            window.showMessage("Visual Web Tester not available", "error");
        }
    };

    // Hook Add New Test Suite button - opens the Add Suite modal
    window.visualEditor.onAddTestSuite = () => {
        // Set flag to indicate graph view is active for adding node after save
        window._graphViewActiveForNewTest = true;

        if (typeof openAddSuiteModal === 'function') {
            openAddSuiteModal();
        } else {
            window.showMessage("Add Suite modal not available", "error");
        }
    };
}

async function runGraphPipeline(pipeline) {
    const modal = document.getElementById('pipeline-run-modal');
    const title = document.getElementById('run-pipeline-name');
    const stepsContainer = document.getElementById('pipeline-execution-steps');
    const consoleOutput = document.getElementById('pipeline-console-output');
    const statusBadge = document.getElementById('pipeline-overall-status');

    title.textContent = pipeline.name;
    stepsContainer.innerHTML = '<div class="text-gray-500 italic p-4">Graph view execution requires console monitoring. Detailed step UI is currently simplified for graphs.</div>';

    // Initialize Log Capture
    window.currentPipelineExecutionLog = `=== GRAPH PIPELINE EXECUTION LOG ===\nPipeline: ${pipeline.name}\nStarted: ${new Date().toISOString()}\n\n`;

    consoleOutput.innerHTML = `<span class="text-blue-400">>>> Initializing Graph Engine for: ${pipeline.name}</span><br>`;
    window.currentPipelineExecutionLog += `>>> Initializing Graph Engine for: ${pipeline.name}\n`;

    statusBadge.className = "px-3 py-1 rounded-full text-sm font-bold bg-blue-100 text-blue-600";
    statusBadge.innerText = "RUNNING";
    modal.classList.remove('hidden');

    try {
        const engine = new window.GraphEngine();

        const result = await engine.execute(pipeline, async (node, inputs, context) => {
            consoleOutput.innerHTML += `<span class="text-gray-300">Running Node: ${node.data.name}...</span><br>`;
            window.currentPipelineExecutionLog += `Running Node: ${node.data.name}...\n`;

            // Handle special node types
            const nodeType = node.type || node.data.type || 'test-suite';

            // Git Repo node
            if (nodeType === 'git-repo') {
                consoleOutput.innerHTML += `<span class="text-orange-400">  📦 Cloning Git Repository...</span><br>`;
                window.currentPipelineExecutionLog += `  📦 Cloning Git Repository...\n`;

                let repoUrl = node.data.repoUrl;
                const branch = node.data.branch || 'main';
                const auth = node.data.auth;

                // Runtime Sanitization: Strip /tree/ or /blob/ and branch segments if still present
                if (repoUrl && repoUrl.includes('github.com')) {
                    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/(blob|tree)\/([^\/]+)/);
                    if (match) {
                        const cleanUrl = `https://github.com/${match[1]}/${match[2]}`;
                        console.log(`[Runtime] Auto-corrected Git URL: ${repoUrl} -> ${cleanUrl}`);
                        repoUrl = cleanUrl;
                    }
                }

                if (!repoUrl) {
                    return { status: 'FAILURE', message: 'No Repository URL configured' };
                }

                try {
                    const result = await window.electronAPI.gitOps.clone(repoUrl, branch, auth);
                    consoleOutput.innerHTML += `<span class="text-green-400">  ✓ Cloned to ${result.path}</span><br>`;
                    window.currentPipelineExecutionLog += `  ✓ Cloned to ${result.path}\n`;

                    return {
                        status: 'SUCCESS',
                        message: `Cloned ${repoUrl}`,
                        artifacts: {
                            repoPath: result.path,
                            source: 'git'
                        }
                    };
                } catch (err) {
                    consoleOutput.innerHTML += `<span class="text-red-400">  ✗ Clone Failed: ${err.message}</span><br>`;
                    return { status: 'FAILURE', message: `Clone Failed: ${err.message}` };
                }
            }

            // Unit Test Runner node
            if (nodeType === 'unit-test-runner') {
                consoleOutput.innerHTML += `<span class="text-purple-400">  🧪 Running Unit Tests...</span><br>`;
                window.currentPipelineExecutionLog += `  🧪 Running Unit Tests...\n`;

                const repoPath = inputs?.repoPath || inputs?.artifacts?.repoPath;
                if (!repoPath) {
                    const msg = 'No repository path found. Ensure a Git Repo node is connected upstream.';
                    consoleOutput.innerHTML += `<span class="text-red-400">  ✗ ${msg}</span><br>`;
                    return { status: 'FAILURE', message: msg };
                }

                const cmd = node.data.command || 'npm test';

                // INJECT TEST CODE IF PRESENT
                if (node.data.testCode && node.data.testFilename) {
                    consoleOutput.innerHTML += `<span class="text-blue-300">  💾 Injecting test file: ${node.data.testFilename}...</span><br>`;
                    window.currentPipelineExecutionLog += `  💾 Injecting test file: ${node.data.testFilename}...\n`;

                    try {
                        const filePathsToInject = node.data.testFilename.includes('/') || node.data.testFilename.includes('\\')
                            ? node.data.testFilename
                            : node.data.testFilename; // Should handle path joining in backend if needed, but for now assuming root

                        // We need to join repoPath + filename safely. 
                        // Since we can't import 'path' module here easily in browser context without require, 
                        // we'll let the backend handle the full path construction or do simple string concat if OS specific separator known.
                        // Better approach: Pass repoPath and filename separately to a new fileOps function? 
                        // Or just concat with '/' since Windows handles mixed separators usually fine in Node/Electron.

                        const fullPath = repoPath + (repoPath.endsWith('\\') || repoPath.endsWith('/') ? '' : (repoPath.includes('\\') ? '\\' : '/')) + node.data.testFilename;

                        await window.electronAPI.fileOps.writeFile(fullPath, node.data.testCode);
                    } catch (injectErr) {
                        consoleOutput.innerHTML += `<span class="text-red-400">  ❌ Injection Failed: ${injectErr.message}</span><br>`;
                        return { status: 'FAILURE', message: `Injection Failed: ${injectErr.message}` };
                    }
                }

                consoleOutput.innerHTML += `<span class="text-gray-300">  > ${cmd}</span><br>`;
                window.currentPipelineExecutionLog += `  > ${cmd}\n`;

                try {
                    // Check if sysOps exists (backward compatibility)
                    if (!window.electronAPI.sysOps) {
                        throw new Error("System Operations API not available. Restart application.");
                    }

                    const result = await window.electronAPI.sysOps.runCommand(repoPath, cmd);

                    // Display output
                    const outputLog = (result.stdout + "\n" + result.stderr).trim();
                    const outputHtml = outputLog.replace(/\n/g, '<br>').replace(/\s/g, '&nbsp;');
                    consoleOutput.innerHTML += `<div class="text-xs text-gray-400 font-mono p-2 bg-gray-900 rounded my-2 max-h-60 overflow-auto whitespace-nowrap">${outputHtml}</div>`;
                    window.currentPipelineExecutionLog += outputLog + "\n";

                    if (result.exitCode === 0) {
                        consoleOutput.innerHTML += `<span class="text-green-400">  ✅ Tests Passed</span><br>`;
                        return { status: 'SUCCESS', message: 'Tests Passed', output: result.stdout };
                    } else {
                        consoleOutput.innerHTML += `<span class="text-red-400">  ❌ Tests Failed (Exit Code: ${result.exitCode})</span><br>`;
                        return { status: 'FAILURE', message: 'Tests Failed', output: result.stderr };
                    }
                } catch (err) {
                    consoleOutput.innerHTML += `<span class="text-red-400">  ❌ Execution Error: ${err.message}</span><br>`;
                    return { status: 'FAILURE', message: err.message };
                }
            }

            // Security Scan node
            if (nodeType === 'security_scan') {
                consoleOutput.innerHTML += `<span class="text-purple-400">  🔒 Running Security Scan...</span><br>`;
                window.currentPipelineExecutionLog += `  🔒 Running Security Scan...\n`;

                if (!window.securityManager) {
                    return { status: 'FAILURE', message: 'Security manager not loaded' };
                }

                // Get code from previous node outputs or use scan config
                const scanConfig = node.data.config || {};

                // CHECK FOR INFRASTRUCTURE SCANS
                if (['docker_container', 'docker_image', 'k8s_yaml', 'network_port'].includes(scanConfig.scanType)) {
                    const target = inputs?.target || scanConfig.target;

                    if (!target && scanConfig.scanType !== 'k8s_scan_cluster') { // k8s cluster might not need specific target
                        consoleOutput.innerHTML += `<span class="text-red-400">  ✗ Missing target for ${scanConfig.scanType}</span><br>`;
                        return { status: 'FAILURE', message: 'Missing target for infrastructure scan' };
                    }

                    consoleOutput.innerHTML += `<span class="text-blue-300">  🔍 Scanning ${scanConfig.scanType}: ${target}...</span><br>`;

                    const scanResult = await window.securityManager.runInfrastructureScan(target, scanConfig.scanType, {
                        name: node.data.name
                    });

                    const vulnCount = scanResult.summary?.total || 0;
                    consoleOutput.innerHTML += `<span class="text-${vulnCount > 0 ? 'yellow' : 'green'}-400">  Found ${vulnCount} issues</span><br>`;
                    window.currentPipelineExecutionLog += `  Found ${vulnCount} issues\n`;

                    if (scanResult.error) {
                        consoleOutput.innerHTML += `<span class="text-red-400">  ✗ Error: ${scanResult.error}</span><br>`;
                    }

                    return {
                        status: scanResult.policyPassed ? 'SUCCESS' : 'FAILURE',
                        message: `Infra scan: ${vulnCount} issues`,
                        securityResults: scanResult
                    };
                }

                // Default: Code Scan
                let codeToScan = inputs?.code || scanConfig.code || '';

                // If upstream artifact has repoPath, read files from it
                if (inputs?.repoPath || inputs?.artifacts?.repoPath) {
                    consoleOutput.innerHTML += `<span class="text-blue-300">  📂 Reading files from cloned repo...</span><br>`;
                    try {
                        const repoPath = inputs.repoPath || inputs.artifacts.repoPath;
                        // For MVP, just read top-level or src .js files? 
                        // Let's read recursively .js files
                        const filePaths = await window.electronAPI.fileOps.listFiles(repoPath, 'js');
                        consoleOutput.innerHTML += `<span class="text-gray-400">    Found ${filePaths.length} JS files.</span><br>`;

                        // Limit to preventing memory boom if huge repo
                        const limitedFiles = filePaths.slice(0, 50);
                        if (filePaths.length > 50) {
                            consoleOutput.innerHTML += `<span class="text-yellow-400">    ⚠ Scanning first 50 files only.</span><br>`;
                        }

                        for (const fp of limitedFiles) {
                            const content = await window.electronAPI.fileOps.readFile(fp);
                            codeToScan += `\n\n// FILE: ${fp.split(/[\\/]/).pop()}\n${content}`;
                        }
                    } catch (e) {
                        consoleOutput.innerHTML += `<span class="text-red-400">    Error reading repo files: ${e.message}</span><br>`;
                    }
                }

                if (!codeToScan) {
                    consoleOutput.innerHTML += `<span class="text-yellow-400">  ⚠ No code to scan</span><br>`;
                    return { status: 'SUCCESS', message: 'No code to scan', vulnerabilities: [] };
                }

                const scanResult = await window.securityManager.runCodeScan(codeToScan, {
                    language: scanConfig.language || 'javascript',
                    scanTypes: scanConfig.scanTypes || ['sast', 'secrets']
                });

                const vulnCount = scanResult.summary?.total || 0;
                consoleOutput.innerHTML += `<span class="text-${vulnCount > 0 ? 'yellow' : 'green'}-400">  Found ${vulnCount} vulnerabilities</span><br>`;
                window.currentPipelineExecutionLog += `  Found ${vulnCount} vulnerabilities\n`;

                // Send security notification if configured
                if (window.integrationsManager && scanConfig.notify) {
                    await window.integrationsManager.sendSecurityNotification(scanResult);
                }

                return {
                    status: scanResult.policyPassed ? 'SUCCESS' : 'FAILURE',
                    message: `Security scan: ${vulnCount} vulnerabilities`,
                    securityResults: scanResult
                };
            }

            // Security Gate node
            if (nodeType === 'security_gate') {
                consoleOutput.innerHTML += `<span class="text-orange-400">  🚧 Checking Security Gate...</span><br>`;
                window.currentPipelineExecutionLog += `  🚧 Checking Security Gate...\n`;

                const gateConfig = node.data.config || {};
                const maxCritical = gateConfig.maxCritical ?? 0;
                const maxHigh = gateConfig.maxHigh ?? 5;
                const maxMedium = gateConfig.maxMedium ?? 20;

                // Gather security results from inputs
                const securityResults = inputs?.securityResults || context?.lastSecurityResults;

                if (!securityResults) {
                    consoleOutput.innerHTML += `<span class="text-yellow-400">  ⚠ No security scan results to check</span><br>`;
                    return { status: 'SUCCESS', message: 'No security results to gate' };
                }

                const critical = securityResults.summary?.critical || 0;
                const high = securityResults.summary?.high || 0;
                const medium = securityResults.summary?.medium || 0;

                const passed = critical <= maxCritical && high <= maxHigh && medium <= maxMedium;

                if (passed) {
                    consoleOutput.innerHTML += `<span class="text-green-400">  ✓ Security gate PASSED</span><br>`;
                    window.currentPipelineExecutionLog += `  ✓ Security gate PASSED\n`;
                    return { status: 'SUCCESS', message: 'Security gate passed' };
                } else {
                    consoleOutput.innerHTML += `<span class="text-red-500">  ✗ Security gate FAILED (C:${critical}/${maxCritical}, H:${high}/${maxHigh}, M:${medium}/${maxMedium})</span><br>`;
                    window.currentPipelineExecutionLog += `  ✗ Security gate FAILED\n`;
                    return { status: 'FAILURE', message: `Security gate failed: ${critical} critical, ${high} high, ${medium} medium` };
                }
            }

            // Default: Execute as test suite
            const suiteResult = await window.runTestSuite(node.data.suiteId, true, inputs);

            if (suiteResult.status === 'SUCCESS') {
                consoleOutput.innerHTML += `<span class="text-green-400">  ✓ PASS</span><br>`;
                window.currentPipelineExecutionLog += `  ✓ PASS\n`;
            } else {
                consoleOutput.innerHTML += `<span class="text-red-500">  ✗ FAIL: ${suiteResult.message || 'Unknown error'}</span><br>`;
                window.currentPipelineExecutionLog += `  ✗ FAIL: ${suiteResult.message || 'Unknown error'}\n`;
            }

            // Append suite details to master log
            if (suiteResult.log) {
                window.currentPipelineExecutionLog += `\n--- TEST SUITE LOG: ${node.data.name} ---\n${suiteResult.log}\n-----------------------------------\n\n`;
            }

            return suiteResult;
        });

        consoleOutput.innerHTML += `<br><span class="text-white font-bold border-t border-gray-600 pt-2 block">Graph Execution Finished. Status: ${result.status}</span>`;
        window.currentPipelineExecutionLog += `\nGraph Execution Finished. Status: ${result.status}\nDuration: ${result.duration}ms\n`;

        pipeline.lastRun = new Date().toISOString();
        pipeline.lastStatus = result.status;
        savePipelines();

        if (result.status === 'SUCCESS') {
            statusBadge.className = "px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-600";
            statusBadge.innerText = "SUCCESS";
        } else {
            statusBadge.className = "px-3 py-1 rounded-full text-sm font-bold bg-red-100 text-red-600";
            statusBadge.innerText = "FAILURE";
        }

    } catch (e) {
        console.error(e);
        consoleOutput.innerHTML += `<span class="text-red-600 font-bold">CRITICAL ENGINE ERROR: ${e.message}</span>`;
        statusBadge.innerText = "ERROR";
    }
}

// Make global
window.initializePipelineManager = initializePipelineManager;
window.openPipelineEditor = openPipelineEditor;
window.openVisualPipelineEditor = openVisualPipelineEditor; // Exported
window.editPipeline = editPipeline;
window.deletePipeline = deletePipeline;
window.runPipeline = runPipeline;
window.closePipelineEditor = closePipelineEditor;
window.savePipeline = savePipeline;
window.closePipelineRunModal = closePipelineRunModal;
window.loadPipelines = loadPipelines;
// Legacy exports retained...
window.addNewStageToPipeline = addNewStageToPipeline;
window.addActionToSelectedStage = addActionToSelectedStage;
window.removeStage = removeStage;
window.removeAction = removeAction;
window.selectStage = selectStage;
window.updateStageLogic = updateStageLogic;
window.updateStageName = updateStageName;
window.updateStageName = updateStageName;
window.moveStage = moveStage;

// Log Download Feature
window.downloadPipelineLog = function () {
    if (!window.currentPipelineExecutionLog) {
        alert("No log data available.");
        return;
    }
    const blob = new Blob([window.currentPipelineExecutionLog], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
};
