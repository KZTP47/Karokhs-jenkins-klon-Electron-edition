// ============================================
// INDEXEDDB VERSION STORAGE ADAPTER
// ============================================
// This replaces localStorage with IndexedDB for version histories
// Provides 50 MB - 1 GB+ storage instead of 5-10 MB

class IndexedDBVersionStorage {
  constructor() {
    this.dbName = 'LVX_Machina_Versions';
    this.dbVersion = 1;
    this.storeName = 'version_histories';
    this.db = null;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('IndexedDB error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB initialized for version storage');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, { keyPath: 'suiteId' });
          objectStore.createIndex('suiteId', 'suiteId', { unique: true });
          console.log('📦 Created IndexedDB object store for versions');
        }
      };
    });
  }

  async saveVersionHistory(suiteId, versions) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const request = store.put({
        suiteId: suiteId,
        versions: versions,
        lastUpdated: new Date().toISOString()
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getVersionHistory(suiteId) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(suiteId);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.versions : []);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async deleteVersionHistory(suiteId) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(suiteId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllSuiteIds() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage,
        quota: estimate.quota,
        usageMB: (estimate.usage / 1024 / 1024).toFixed(2),
        quotaMB: (estimate.quota / 1024 / 1024).toFixed(2),
        percentUsed: ((estimate.usage / estimate.quota) * 100).toFixed(1)
      };
    }
    return null;
  }

  async migrateFromLocalStorage() {
    console.log('🔄 Migrating version histories from localStorage to IndexedDB...');
    
    let migrated = 0;
    const keys = Object.keys(localStorage).filter(k => k.startsWith('suite_versions_'));
    
    for (const key of keys) {
      try {
        const suiteId = key.replace('suite_versions_', '');
        const versions = JSON.parse(localStorage.getItem(key));
        
        await this.saveVersionHistory(suiteId, versions);
        
        // Remove from localStorage after successful migration
        localStorage.removeItem(key);
        migrated++;
      } catch (error) {
        console.error(`Failed to migrate ${key}:`, error);
      }
    }
    
    console.log(`✅ Migrated ${migrated} version histories to IndexedDB`);
    return migrated;
  }
}

// ============================================
// ENHANCED VERSION CONTROL WITH INDEXEDDB
// ============================================

class VersionControlWithIndexedDB {
  constructor() {
    this.MAX_VERSIONS_PER_SUITE = 100; // Can keep way more now!
    this.storage = new IndexedDBVersionStorage();
    this.initialized = false;
  }

  async initialize() {
    try {
      await this.storage.initialize();
      this.initialized = true;
      
      // Check if we should migrate from localStorage
      const hasLocalStorageVersions = Object.keys(localStorage)
        .some(k => k.startsWith('suite_versions_'));
      
      if (hasLocalStorageVersions) {
        const shouldMigrate = confirm(
          'Found version histories in localStorage. Migrate to IndexedDB for unlimited storage?'
        );
        
        if (shouldMigrate) {
          await this.storage.migrateFromLocalStorage();
          if (window.showMessage) {
            window.showMessage('Version histories migrated to unlimited storage!', 'success');
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to initialize IndexedDB:', error);
      if (window.showMessage) {
        window.showMessage('Using localStorage fallback (limited storage)', 'warning');
      }
      return false;
    }
  }

  async saveVersion(suiteId, suiteSnapshot, changeDescription = 'Auto-save') {
    const versions = await this.getVersionHistory(suiteId);
    const newVersion = {
      versionId: this._generateId(),
      timestamp: new Date().toISOString(),
      suiteSnapshot: JSON.parse(JSON.stringify(suiteSnapshot)),
      changeDescription,
      changedBy: 'user'
    };
    
    if (versions.length > 0) {
      newVersion.diff = this._calculateDiff(
        versions[versions.length - 1].suiteSnapshot,
        suiteSnapshot
      );
    } else {
      newVersion.diff = { modified: [] };
    }
    
    versions.push(newVersion);
    
    if (versions.length > this.MAX_VERSIONS_PER_SUITE) {
      versions.shift();
    }
    
    if (this.initialized) {
      try {
        await this.storage.saveVersionHistory(suiteId, versions);
        return newVersion.versionId;
      } catch (error) {
        console.error('IndexedDB save failed, falling back to localStorage:', error);
        // Fallback to localStorage
        return this._saveToLocalStorage(suiteId, versions, newVersion.versionId);
      }
    } else {
      return this._saveToLocalStorage(suiteId, versions, newVersion.versionId);
    }
  }

  async getVersionHistory(suiteId) {
    if (this.initialized) {
      try {
        return await this.storage.getVersionHistory(suiteId);
      } catch (error) {
        console.error('IndexedDB get failed, falling back to localStorage:', error);
        return this._getFromLocalStorage(suiteId);
      }
    } else {
      return this._getFromLocalStorage(suiteId);
    }
  }

  async deleteVersionHistory(suiteId) {
    if (this.initialized) {
      try {
        await this.storage.deleteVersionHistory(suiteId);
      } catch (error) {
        console.error('IndexedDB delete failed:', error);
      }
    }
    // Also remove from localStorage if exists
    localStorage.removeItem(`suite_versions_${suiteId}`);
  }

  async getStorageInfo() {
    if (this.initialized) {
      const estimate = await this.storage.getStorageEstimate();
      if (estimate) {
        return {
          type: 'IndexedDB',
          ...estimate,
          isUnlimited: true
        };
      }
    }
    
    // Fallback to localStorage info
    let totalSize = 0;
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('suite_versions_')) {
        totalSize += localStorage.getItem(key).length;
      }
    });
    
    return {
      type: 'localStorage',
      usage: totalSize,
      quota: 10 * 1024 * 1024,
      usageMB: (totalSize / 1024 / 1024).toFixed(2),
      quotaMB: '10',
      percentUsed: ((totalSize / (10 * 1024 * 1024)) * 100).toFixed(1),
      isUnlimited: false
    };
  }

  // Fallback methods
  _saveToLocalStorage(suiteId, versions, versionId) {
    try {
      localStorage.setItem(`suite_versions_${suiteId}`, JSON.stringify(versions));
      return versionId;
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        throw new Error('Storage quota exceeded. Please enable IndexedDB or clear old versions.');
      }
      throw e;
    }
  }

  _getFromLocalStorage(suiteId) {
    const data = localStorage.getItem(`suite_versions_${suiteId}`);
    return data ? JSON.parse(data) : [];
  }

  _calculateDiff(oldSuite, newSuite) {
    const diff = { modified: [] };
    
    if (oldSuite.name !== newSuite.name) {
      diff.modified.push({ field: 'name', old: oldSuite.name, new: newSuite.name });
    }
    if (oldSuite.code !== newSuite.code) {
      diff.modified.push({ field: 'code', old: oldSuite.code, new: newSuite.code });
    }
    if (oldSuite.description !== newSuite.description) {
      diff.modified.push({ field: 'description', old: oldSuite.description, new: newSuite.description });
    }
    if (oldSuite.language !== newSuite.language) {
      diff.modified.push({ field: 'language', old: oldSuite.language, new: newSuite.language });
    }
    if (oldSuite.expected_output !== newSuite.expected_output) {
      diff.modified.push({ field: 'expected_output', old: oldSuite.expected_output, new: newSuite.expected_output });
    }
    
    return diff;
  }

  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

// ============================================
// USAGE
// ============================================

// Initialize on page load
(async function() {
  console.log('🚀 Initializing IndexedDB version control...');
  
  window.indexedDBVersionControl = new VersionControlWithIndexedDB();
  const success = await window.indexedDBVersionControl.initialize();
  
  if (success) {
    console.log('✅ IndexedDB ready! You now have unlimited version storage.');
    
    // Show storage info
    const info = await window.indexedDBVersionControl.getStorageInfo();
    console.log('📊 Storage Info:', info);
    
    if (window.showMessage) {
      window.showMessage(
        `Unlimited storage enabled! (${info.usageMB} MB used of ${info.quotaMB} MB)`,
        'success'
      );
    }
  } else {
    console.log('⚠️ Using localStorage fallback');
  }
})();

// Helper function to check storage
window.checkIndexedDBStorage = async function() {
  if (window.indexedDBVersionControl) {
    const info = await window.indexedDBVersionControl.getStorageInfo();
    console.log('=== Storage Information ===');
    console.log(`Type: ${info.type}`);
    console.log(`Usage: ${info.usageMB} MB`);
    console.log(`Quota: ${info.quotaMB} MB`);
    console.log(`Percent Used: ${info.percentUsed}%`);
    console.log(`Unlimited: ${info.isUnlimited ? 'Yes ✅' : 'No ❌'}`);
    return info;
  }
  return null;
};
