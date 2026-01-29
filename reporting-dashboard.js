class TestHistoryManager {
  constructor() {
    this.STORAGE_KEY = 'test_execution_history';
    this.MAX_HISTORY_ENTRIES = 1000; // Keep last 1000 executions
  }

  // Record a test execution
  recordExecution(suiteId, suiteName, result) {
    const history = this.getHistory();

    const record = {
      id: this._generateId(),
      suiteId,
      suiteName,
      timestamp: new Date().toISOString(),
      status: result.status, // 'PASSED', 'FAILED', 'ERROR'
      executionTime: result.executionTime || 0, // milliseconds
      errorMessage: result.errorMessage || null,
      iterationCount: result.iterationCount || 1, // for data-driven tests
      passedIterations: result.passedIterations || (result.status === 'PASSED' ? 1 : 0),
      failedIterations: result.failedIterations || (result.status === 'FAILED' ? 1 : 0)
    };

    history.push(record);

    // Keep only MAX_HISTORY_ENTRIES
    if (history.length > this.MAX_HISTORY_ENTRIES) {
      history.splice(0, history.length - this.MAX_HISTORY_ENTRIES);
    }

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));
    return record.id;
  }

  // Get all history
  getHistory() {
    const data = localStorage.getItem(this.STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  // Get history for specific suite
  getSuiteHistory(suiteId, limit = 50) {
    return this.getHistory()
      .filter(r => r.suiteId === suiteId)
      .slice(-limit);
  }

  // Get recent history
  getRecentHistory(days = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return this.getHistory().filter(r => new Date(r.timestamp) >= cutoff);
  }

  // Calculate statistics
  calculateStatistics(history = null) {
    const data = history || this.getHistory();

    if (data.length === 0) {
      return {
        totalExecutions: 0,
        totalPassed: 0,
        totalFailed: 0,
        passRate: 0,
        failRate: 0,
        averageExecutionTime: 0,
        totalExecutionTime: 0
      };
    }

    const totalExecutions = data.length;
    const totalPassed = data.filter(r => r.status === 'PASSED').length;
    const totalFailed = data.filter(r => r.status === 'FAILED' || r.status === 'ERROR').length;
    const totalExecutionTime = data.reduce((sum, r) => sum + (r.executionTime || 0), 0);

    return {
      totalExecutions,
      totalPassed,
      totalFailed,
      passRate: (totalPassed / totalExecutions * 100).toFixed(1),
      failRate: (totalFailed / totalExecutions * 100).toFixed(1),
      averageExecutionTime: Math.round(totalExecutionTime / totalExecutions),
      totalExecutionTime
    };
  }

  // Detect flaky tests (tests that sometimes pass, sometimes fail)
  detectFlakyTests(threshold = 0.3) {
    const suiteStats = new Map();
    const history = this.getHistory();

    // Group by suite
    history.forEach(record => {
      if (!suiteStats.has(record.suiteId)) {
        suiteStats.set(record.suiteId, {
          suiteId: record.suiteId,
          suiteName: record.suiteName,
          executions: [],
          passed: 0,
          failed: 0
        });
      }

      const stats = suiteStats.get(record.suiteId);
      stats.executions.push(record);
      if (record.status === 'PASSED') stats.passed++;
      else stats.failed++;
    });

    // Find flaky tests (have both passes and failures, and failure rate is above threshold)
    const flakyTests = [];
    suiteStats.forEach(stats => {
      if (stats.executions.length >= 5 && stats.passed > 0 && stats.failed > 0) {
        const failRate = stats.failed / stats.executions.length;
        if (failRate >= threshold && failRate <= (1 - threshold)) {
          flakyTests.push({
            ...stats,
            flakinessScore: Math.min(failRate, 1 - failRate) * 2, // 0-1 scale
            recentExecutions: stats.executions.slice(-10)
          });
        }
      }
    });

    // Sort by flakiness score (most flaky first)
    return flakyTests.sort((a, b) => b.flakinessScore - a.flakinessScore);
  }

  // Get execution trends over time
  getExecutionTrends(days = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const recentHistory = this.getHistory().filter(r => new Date(r.timestamp) >= cutoff);

    // Group by day
    const dailyStats = new Map();

    recentHistory.forEach(record => {
      const date = new Date(record.timestamp).toISOString().split('T')[0];

      if (!dailyStats.has(date)) {
        dailyStats.set(date, {
          date,
          passed: 0,
          failed: 0,
          total: 0,
          totalTime: 0
        });
      }

      const stats = dailyStats.get(date);
      stats.total++;
      stats.totalTime += record.executionTime || 0;
      if (record.status === 'PASSED') stats.passed++;
      else stats.failed++;
    });

    // Convert to array and sort by date
    return Array.from(dailyStats.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  // Get slowest tests
  getSlowestTests(limit = 10) {
    const history = this.getHistory();

    // Group by suite and calculate average execution time
    const suiteAvgTimes = new Map();

    history.forEach(record => {
      if (!suiteAvgTimes.has(record.suiteId)) {
        suiteAvgTimes.set(record.suiteId, {
          suiteId: record.suiteId,
          suiteName: record.suiteName,
          executions: [],
          totalTime: 0
        });
      }

      const stats = suiteAvgTimes.get(record.suiteId);
      stats.executions.push(record);
      stats.totalTime += record.executionTime || 0;
    });

    // Calculate averages
    const avgTimes = Array.from(suiteAvgTimes.values()).map(stats => ({
      suiteId: stats.suiteId,
      suiteName: stats.suiteName,
      averageTime: Math.round(stats.totalTime / stats.executions.length),
      executionCount: stats.executions.length,
      slowestTime: Math.max(...stats.executions.map(e => e.executionTime || 0))
    }));

    // Sort by average time
    return avgTimes.sort((a, b) => b.averageTime - a.averageTime).slice(0, limit);
  }

  // Get most frequently run tests
  getMostRunTests(limit = 10) {
    const history = this.getHistory();
    const suiteRunCounts = new Map();

    history.forEach(record => {
      if (!suiteRunCounts.has(record.suiteId)) {
        suiteRunCounts.set(record.suiteId, {
          suiteId: record.suiteId,
          suiteName: record.suiteName,
          runCount: 0,
          lastRun: record.timestamp
        });
      }

      const stats = suiteRunCounts.get(record.suiteId);
      stats.runCount++;
      if (new Date(record.timestamp) > new Date(stats.lastRun)) {
        stats.lastRun = record.timestamp;
      }
    });

    return Array.from(suiteRunCounts.values())
      .sort((a, b) => b.runCount - a.runCount)
      .slice(0, limit);
  }

  // Clear old history
  clearOldHistory(days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const history = this.getHistory().filter(r => new Date(r.timestamp) >= cutoff);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));

    return history.length;
  }

  // Export history
  exportHistory() {
    return this.getHistory();
  }

  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

// Export
window.TestHistoryManager = TestHistoryManager;
window.testHistoryManager = new TestHistoryManager();

// ============================================
// DASHBOARD UI LOGIC
// ============================================

let trendChart = null;
let distributionChart = null;
let suiteHistoryChart = null;

// Open dashboard
function openReportingDashboard() {
  document.getElementById('reporting-dashboard-modal').classList.remove('hidden');
  refreshDashboard();
}

function closeDashboard() {
  document.getElementById('reporting-dashboard-modal').classList.add('hidden');

  // Destroy charts to prevent memory leaks
  if (trendChart) {
    trendChart.destroy();
    trendChart = null;
  }
  if (distributionChart) {
    distributionChart.destroy();
    distributionChart = null;
  }
}

// Refresh all dashboard data
function refreshDashboard() {
  const timeframe = document.getElementById('dashboard-timeframe').value;
  const days = timeframe === 'all' ? null : parseInt(timeframe);

  const history = days ? window.testHistoryManager.getRecentHistory(days) : window.testHistoryManager.getHistory();

  renderSummaryStatistics(history);
  renderTrendChart(days || 30);
  renderDistributionChart(history);
  renderFlakyTests();
  renderSlowestTests();
  renderMostRunTests();
  renderRecentExecutions(history.slice(-20).reverse());
}

// Render summary statistics
function renderSummaryStatistics(history) {
  const stats = window.testHistoryManager.calculateStatistics(history);

  document.getElementById('stat-total').textContent = stats.totalExecutions;
  document.getElementById('stat-pass-rate').textContent = stats.passRate + '%';
  document.getElementById('stat-avg-time').textContent = stats.averageExecutionTime + 'ms';
  document.getElementById('stat-total-time').textContent = (stats.totalExecutionTime / 1000).toFixed(1) + 's';

  // Color pass rate based on value
  const passRateElement = document.getElementById('stat-pass-rate');
  if (parseFloat(stats.passRate) >= 90) {
    passRateElement.className = 'text-3xl font-bold text-green-600';
  } else if (parseFloat(stats.passRate) >= 70) {
    passRateElement.className = 'text-3xl font-bold text-yellow-600';
  } else {
    passRateElement.className = 'text-3xl font-bold text-red-600';
  }
}

// Render trend chart
function renderTrendChart(days) {
  const trends = window.testHistoryManager.getExecutionTrends(days);

  const ctx = document.getElementById('trend-chart');
  if (!ctx) return;

  // Destroy existing chart
  if (trendChart) {
    trendChart.destroy();
  }

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trends.map(t => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
      datasets: [
        {
          label: 'Passed',
          data: trends.map(t => t.passed),
          borderColor: '#4CAF50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          tension: 0.3
        },
        {
          label: 'Failed',
          data: trends.map(t => t.failed),
          borderColor: '#F44336',
          backgroundColor: 'rgba(244, 67, 54, 0.1)',
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}

// Render distribution chart
function renderDistributionChart(history) {
  const stats = window.testHistoryManager.calculateStatistics(history);

  const ctx = document.getElementById('distribution-chart');
  if (!ctx) return;

  // Destroy existing chart
  if (distributionChart) {
    distributionChart.destroy();
  }

  distributionChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Passed', 'Failed'],
      datasets: [{
        data: [stats.totalPassed, stats.totalFailed],
        backgroundColor: ['#4CAF50', '#F44336'],
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

// Render flaky tests
function renderFlakyTests() {
  const flakyTests = window.testHistoryManager.detectFlakyTests(0.2);
  const section = document.getElementById('flaky-tests-section');
  const list = document.getElementById('flaky-tests-list');

  if (flakyTests.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');

  list.innerHTML = flakyTests.map(test => {
    const failRate = (test.failed / test.executions.length * 100).toFixed(1);
    return `
      <div class='aero-button p-3 rounded flex justify-between items-center'>
        <div>
          <div class='font-semibold'>${test.suiteName}</div>
          <div class='text-xs aero-text-muted'>
            ${test.executions.length} runs: ${test.passed} passed, ${test.failed} failed (${failRate}% fail rate)
          </div>
        </div>
        <div class='flex items-center gap-2'>
          <div class='text-2xl'>${getStabilityIcon(test.flakinessScore)}</div>
          <button onclick='openSuiteHistoryModal("${test.suiteId}")' 
            class='aero-button-info text-sm py-1 px-3 rounded'>
            View History
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function getStabilityIcon(score) {
  if (score > 0.7) return '🔴';
  if (score > 0.4) return '🟡';
  return '🟢';
}

// Render slowest tests
function renderSlowestTests() {
  const slowestTests = window.testHistoryManager.getSlowestTests(5);
  const list = document.getElementById('slowest-tests-list');

  if (slowestTests.length === 0) {
    list.innerHTML = '<p class="text-sm aero-text-muted">No execution data yet</p>';
    return;
  }

  list.innerHTML = slowestTests.map((test, index) => `
    <div class='aero-button p-2 rounded flex justify-between items-center'>
      <div class='flex items-center gap-2'>
        <span class='font-bold aero-text-muted'>#${index + 1}</span>
        <span class='text-sm'>${test.suiteName}</span>
      </div>
      <div class='text-right'>
        <div class='font-semibold'>${test.averageTime}ms</div>
        <div class='text-xs aero-text-muted'>avg of ${test.executionCount} runs</div>
      </div>
    </div>
  `).join('');
}

// Render most run tests
function renderMostRunTests() {
  const mostRunTests = window.testHistoryManager.getMostRunTests(5);
  const list = document.getElementById('most-run-tests-list');

  if (mostRunTests.length === 0) {
    list.innerHTML = '<p class="text-sm aero-text-muted">No execution data yet</p>';
    return;
  }

  list.innerHTML = mostRunTests.map((test, index) => `
    <div class='aero-button p-2 rounded flex justify-between items-center'>
      <div class='flex items-center gap-2'>
        <span class='font-bold aero-text-muted'>#${index + 1}</span>
        <span class='text-sm'>${test.suiteName}</span>
      </div>
      <div class='text-right'>
        <div class='font-semibold'>${test.runCount} runs</div>
        <div class='text-xs aero-text-muted'>${new Date(test.lastRun).toLocaleDateString()}</div>
      </div>
    </div>
  `).join('');
}

// Render recent executions table
function renderRecentExecutions(history) {
  const tbody = document.getElementById('recent-executions-body');

  if (history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 aero-text-muted">No executions yet</td></tr>';
    return;
  }

  tbody.innerHTML = history.map(record => `
    <tr class='border-b aero-divider hover:bg-blue-50'>
      <td class='p-2'>${new Date(record.timestamp).toLocaleString()}</td>
      <td class='p-2'>${record.suiteName}</td>
      <td class='p-2'>
        <span class='aero-badge-${record.status === 'PASSED' ? 'success' : 'error'}'>
          ${record.status}
        </span>
      </td>
      <td class='p-2'>${record.executionTime}ms</td>
      <td class='p-2'>
        ${record.iterationCount > 1 ? `${record.passedIterations}/${record.iterationCount}` : '-'}
      </td>
    </tr>
  `).join('');
}

// View suite history
function viewSuiteHistory(suiteId) {
  // Close dashboard
  closeDashboard();
  openSuiteHistoryModal(suiteId);
}

// ============================================
// SUITE HISTORY MODAL
// ============================================

function openSuiteHistoryModal(suiteId) {
  const suite = window.testSuites.find(s => s.id === suiteId);
  if (!suite) return;

  document.getElementById('suite-history-name').textContent = suite.name;

  const history = window.testHistoryManager.getSuiteHistory(suiteId, 50);
  const stats = window.testHistoryManager.calculateStatistics(history);

  // Render statistics
  document.getElementById('suite-stat-total').textContent = stats.totalExecutions;
  document.getElementById('suite-stat-pass-rate').textContent = stats.passRate + '%';
  document.getElementById('suite-stat-avg-time').textContent = stats.averageExecutionTime + 'ms';

  // Render chart
  renderSuiteHistoryChart(history);

  // Render execution list
  renderSuiteHistoryList(history.slice().reverse());

  document.getElementById('suite-history-modal').classList.remove('hidden');
}

function closeSuiteHistoryModal() {
  document.getElementById('suite-history-modal').classList.add('hidden');

  if (suiteHistoryChart) {
    suiteHistoryChart.destroy();
    suiteHistoryChart = null;
  }
}

function renderSuiteHistoryChart(history) {
  const ctx = document.getElementById('suite-history-chart');
  if (!ctx) return;

  if (suiteHistoryChart) {
    suiteHistoryChart.destroy();
  }

  // Show last 20 executions
  const recentHistory = history.slice(-20);

  suiteHistoryChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: recentHistory.map((r, i) => `Run ${i + 1}`),
      datasets: [{
        label: 'Execution Time (ms)',
        data: recentHistory.map(r => r.executionTime),
        backgroundColor: recentHistory.map(r =>
          r.status === 'PASSED' ? 'rgba(76, 175, 80, 0.5)' : 'rgba(244, 67, 54, 0.5)'
        ),
        borderColor: recentHistory.map(r =>
          r.status === 'PASSED' ? '#4CAF50' : '#F44336'
        ),
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Time (ms)'
          }
        }
      }
    }
  });
}

function renderSuiteHistoryList(history) {
  const container = document.getElementById('suite-history-list');

  if (history.length === 0) {
    container.innerHTML = '<p class="text-sm aero-text-muted">No execution history yet</p>';
    return;
  }

  container.innerHTML = history.map(record => `
    <div class='aero-button p-3 rounded flex justify-between items-center'>
      <div>
        <div class='text-sm font-semibold'>${new Date(record.timestamp).toLocaleString()}</div>
        <div class='text-xs aero-text-muted'>
          Duration: ${record.executionTime}ms
          ${record.iterationCount > 1 ? ` | ${record.passedIterations}/${record.iterationCount} passed` : ''}
        </div>
        ${record.errorMessage ? `<div class='text-xs aero-text-danger mt-1'>${record.errorMessage}</div>` : ''}
      </div>
      <span class='aero-badge-${record.status === 'PASSED' ? 'success' : 'error'}'>
        ${record.status}
      </span>
    </div>
  `).join('');
}

// Export functions
window.openReportingDashboard = openReportingDashboard;
window.closeDashboard = closeDashboard;
window.refreshDashboard = refreshDashboard;
window.viewSuiteHistory = viewSuiteHistory;
window.openSuiteHistoryModal = openSuiteHistoryModal;
window.closeSuiteHistoryModal = closeSuiteHistoryModal;
