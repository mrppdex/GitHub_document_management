import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  GitBranch,
  FileText,
  Save,
  History,
  Github,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Edit3,
  Eye,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Settings,
  Plus,
  UploadCloud,
  X
} from 'lucide-react';

// --- MOCK DATA FOR DEMO MODE ---
const MOCK_DATA = {
  branches: [{ name: 'main' }, { name: 'develop' }, { name: 'feature/docs-update' }],
  tree: [
    { path: 'README.md', type: 'blob', sha: '1' },
    { path: 'docs/getting-started.md', type: 'blob', sha: '2' },
    { path: 'docs/api-reference.md', type: 'blob', sha: '3' },
    { path: 'CONTRIBUTING.md', type: 'blob', sha: '4' },
  ],
  files: {
    'README.md': '# Project Title\n\nWelcome to the repository. This is a mock file for demonstration.',
    'docs/getting-started.md': '# Getting Started\n\n1. Install dependencies\n2. Run the server\n3. Enjoy!',
    'docs/api-reference.md': '# API Reference\n\nGET /users\nPOST /users',
    'CONTRIBUTING.md': '# Contributing\n\nPlease read this before submitting a PR.',
  },
  history: [
    { commit: { message: 'Update installation guide', author: { name: 'Jane Doe', date: '2023-10-25T14:00:00Z' } }, sha: 'h1' },
    { commit: { message: 'Initial commit', author: { name: 'John Smith', date: '2023-10-24T09:30:00Z' } }, sha: 'h2' }
  ]
};

// --- UTILITY FUNCTIONS ---
const Base64 = {
  encode: (str) => {
    return btoa(unescape(encodeURIComponent(str)));
  },
  decode: (str) => {
    return decodeURIComponent(escape(window.atob(str)));
  }
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// --- COMPONENTS ---

const Notification = ({ message, type, onClose }) => {
  if (!message) return null;
  return (
    <div className={`fixed bottom-4 right-4 p-4 rounded shadow-lg flex items-center gap-2 z-50 ${type === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
      }`}>
      {type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
      <span>{message}</span>
      <button onClick={onClose} className="ml-4 font-bold hover:opacity-75">×</button>
    </div>
  );
};

const FileTreeItem = ({ item, depth = 0, activePath, onSelect, expandedFolders, toggleFolder }) => {
  const isFolder = item.type === 'tree';
  const isExpanded = expandedFolders.has(item.path);
  const isActive = activePath === item.path;

  const handleClick = (e) => {
    e.stopPropagation();
    if (isFolder) {
      toggleFolder(item.path);
    } else {
      onSelect(item);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        className={`flex items-center gap-2 py-1.5 px-2 cursor-pointer text-sm select-none transition-colors
          ${isActive ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-slate-100 text-slate-700'}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isFolder ? (
          <>
            {isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
            {isExpanded ? <FolderOpen size={16} className="text-blue-400" /> : <Folder size={16} className="text-blue-400" />}
          </>
        ) : (
          <FileText size={16} className={isActive ? "text-blue-600" : "text-slate-400"} />
        )}
        <span className="truncate">{item.name}</span>
      </div>
      {isFolder && isExpanded && item.children && (
        <div>
          {item.children.map(child => (
            <FileTreeItem
              key={child.path}
              item={child}
              depth={depth + 1}
              activePath={activePath}
              onSelect={onSelect}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function App() {
  // --- STATE ---
  // Config
  const [config, setConfig] = useState({
    owner: '',
    repo: '',
    token: '',
    mode: 'demo' // 'demo' or 'live'
  });
  const [showConfig, setShowConfig] = useState(true);

  // App Data
  const [branches, setBranches] = useState([]);
  const [currentBranch, setCurrentBranch] = useState('main');
  const [fileTree, setFileTree] = useState([]);

  // Editor State
  const [activeFile, setActiveFile] = useState(null); // { path, sha }
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isEditing, setIsEditing] = useState(true); // true = edit, false = preview
  const [history, setHistory] = useState([]);
  const [viewMode, setViewMode] = useState('editor'); // 'editor', 'history'

  // Status
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ message: '', type: 'info' });

  // Modals
  const [commitMessage, setCommitMessage] = useState('');
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');

  // Refs
  const fileInputRef = useRef(null);

  // --- HELPERS ---
  const showNotify = (msg, type = 'success') => {
    setNotification({ message: msg, type });
    setTimeout(() => setNotification({ message: '', type: 'info' }), 4000);
  };

  const getHeaders = () => ({
    'Authorization': `token ${config.token}`,
    'Accept': 'application/vnd.github.v3+json'
  });

  // --- API CALLS ---

  const fetchBranches = async () => {
    if (config.mode === 'demo') {
      setBranches(MOCK_DATA.branches);
      return;
    }

    try {
      const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/branches`, {
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch branches');
      const data = await res.json();
      setBranches(data);
    } catch (e) {
      showNotify(e.message, 'error');
    }
  };

  const fetchFileTree = async (branch) => {
    if (config.mode === 'demo') {
      // Just mock tree return
      return MOCK_DATA.tree;
    }

    setLoading(true);
    try {
      // Get recursive tree
      const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/git/trees/${branch}?recursive=1`, {
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch file tree');
      const data = await res.json();

      // Filter only blobs (files)
      return data.tree.filter(item => item.type === 'blob');
    } catch (e) {
      showNotify(e.message, 'error');
      return [];
    } finally {
      setLoading(false);
    }
  };

  const fetchFileContent = async (path, sha) => {
    setLoading(true);
    setActiveFile({ path, sha });

    if (config.mode === 'demo') {
      const content = MOCK_DATA.files[path] || '';
      setFileContent(content);
      setOriginalContent(content);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}?ref=${currentBranch}`, {
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch content');
      const data = await res.json();

      // Update SHA to latest from this fetch to ensure we have latest version for commit
      setActiveFile({ path, sha: data.sha });

      const decoded = Base64.decode(data.content);
      setFileContent(decoded);
      setOriginalContent(decoded);
    } catch (e) {
      showNotify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (path) => {
    setViewMode('history');
    if (config.mode === 'demo') {
      setHistory(MOCK_DATA.history);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/commits?path=${path}&sha=${currentBranch}`, {
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch history');
      const data = await res.json();
      setHistory(data);
    } catch (e) {
      showNotify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage) {
      showNotify('Please enter a commit message', 'error');
      return;
    }

    if (config.mode === 'demo') {
      showNotify('Demo Mode: Change simulated! (Refresh resets)', 'success');
      setShowCommitModal(false);
      setOriginalContent(fileContent);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        message: commitMessage,
        content: Base64.encode(fileContent),
        branch: currentBranch
      };

      // Only add SHA if we are updating an existing file.
      // For new files, SHA must be omitted.
      if (activeFile.sha) {
        payload.sha = activeFile.sha;
      }

      const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${activeFile.path}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Commit failed');
      }

      const data = await res.json();

      // Update active file with new SHA so subsequent saves work
      setActiveFile({ ...activeFile, sha: data.content.sha });
      setOriginalContent(fileContent);
      setShowCommitModal(false);
      setCommitMessage('');

      // Refresh tree to show new file if it was new
      if (!activeFile.sha) {
        const files = await fetchFileTree(currentBranch);
        setFileTree(files || []);
      }

      showNotify('Changes committed successfully!', 'success');
    } catch (e) {
      showNotify(`Error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewFile = () => {
    if (!newFilePath) return;
    // Set active file to new path with null SHA (indicating new file)
    setActiveFile({ path: newFilePath, sha: null });
    setFileContent('# New Document\n\nStart writing...');
    setOriginalContent(''); // Indicates unsaved changes immediately
    setIsEditing(true);
    setViewMode('editor');
    setShowNewFileModal(false);
    setNewFilePath('');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      // Default path is root/filename. User can't change directory in this simple upload flow easily
      // but they can rename the file in a more advanced version.
      setActiveFile({ path: file.name, sha: null });
      setFileContent(content);
      setOriginalContent(''); // Indicates unsaved changes
      setIsEditing(true);
      setViewMode('editor');
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = null;
  };

  // --- PROCESSING DATA FOR TREE VIEW ---
  const organizedTree = useMemo(() => {
    const root = { name: 'root', path: '', type: 'tree', children: [] };
    const folderMap = { '': root };

    // Sort: folders first, then files
    const sortedFiles = [...fileTree].sort((a, b) => {
      const aDepth = a.path.split('/').length;
      const bDepth = b.path.split('/').length;
      if (aDepth !== bDepth) return bDepth - aDepth;
      return a.path.localeCompare(b.path);
    });

    // Build hierarchy
    sortedFiles.forEach(file => {
      const parts = file.path.split('/');
      const fileName = parts.pop();
      const dirPath = parts.join('/');

      // Ensure all parent directories exist
      let currentPath = '';
      let parent = root;

      parts.forEach((part, index) => {
        const nextPath = currentPath ? `${currentPath}/${part}` : part;
        if (!folderMap[nextPath]) {
          const newFolder = { name: part, path: nextPath, type: 'tree', children: [] };
          folderMap[nextPath] = newFolder;
          parent.children.push(newFolder);
        }
        parent = folderMap[nextPath];
        currentPath = nextPath;
      });

      // Add file to parent
      parent.children.push({ ...file, name: fileName });
    });

    const sortChildren = (node) => {
      if (node.children) {
        node.children.sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'tree' ? -1 : 1;
        });
        node.children.forEach(sortChildren);
      }
    };
    sortChildren(root);

    return root.children;
  }, [fileTree]);

  // --- EFFECTS ---
  useEffect(() => {
    if (!showConfig) {
      fetchBranches();
    }
  }, [showConfig, config]);

  useEffect(() => {
    if (currentBranch && !showConfig) {
      (async () => {
        const files = await fetchFileTree(currentBranch);
        setFileTree(files || []);
      })();
    }
  }, [currentBranch, showConfig]);

  // --- RENDER ---

  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const toggleFolder = (path) => {
    const next = new Set(expandedFolders);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpandedFolders(next);
  };

  if (showConfig) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-md">
          <div className="flex items-center gap-3 mb-6 text-blue-600">
            <Github size={32} />
            <h1 className="text-2xl font-bold">Repo Manager</h1>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mode</label>
              <div className="flex gap-4">
                <button
                  onClick={() => setConfig({ ...config, mode: 'demo' })}
                  className={`flex-1 py-2 px-4 rounded-lg border ${config.mode === 'demo' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-slate-200'}`}
                >
                  Demo Mode
                </button>
                <button
                  onClick={() => setConfig({ ...config, mode: 'live' })}
                  className={`flex-1 py-2 px-4 rounded-lg border ${config.mode === 'live' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-slate-200'}`}
                >
                  Live GitHub
                </button>
              </div>
            </div>

            {config.mode === 'live' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Repo Owner</label>
                  <input
                    type="text"
                    className="w-full p-2 border rounded-lg"
                    placeholder="e.g., facebook"
                    value={config.owner}
                    onChange={e => setConfig({ ...config, owner: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Repo Name</label>
                  <input
                    type="text"
                    className="w-full p-2 border rounded-lg"
                    placeholder="e.g., react"
                    value={config.repo}
                    onChange={e => setConfig({ ...config, repo: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Personal Access Token</label>
                  <input
                    type="password"
                    className="w-full p-2 border rounded-lg"
                    placeholder="ghp_..."
                    value={config.token}
                    onChange={e => setConfig({ ...config, token: e.target.value })}
                  />
                  <p className="text-xs text-slate-500 mt-1">Required for private repos and pushing changes.</p>
                </div>
              </>
            )}

            <button
              onClick={() => setShowConfig(false)}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors mt-4"
              disabled={config.mode === 'live' && (!config.owner || !config.repo)}
            >
              {config.mode === 'demo' ? 'Launch Demo' : 'Connect to GitHub'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900">
      {/* HEADER */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-blue-700 font-bold text-lg">
            <Github size={24} />
            <span>{config.mode === 'demo' ? 'Demo Repo' : `${config.owner}/${config.repo}`}</span>
          </div>

          <div className="h-6 w-px bg-slate-200 mx-2"></div>

          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-slate-500" />
            <select
              value={currentBranch}
              onChange={(e) => setCurrentBranch(e.target.value)}
              className="bg-slate-100 border-none rounded px-2 py-1 text-sm font-medium focus:ring-2 focus:ring-blue-500"
            >
              {branches.map(b => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowConfig(true)} className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full">
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR: FILE TREE */}
        <aside className="w-64 bg-white border-r flex flex-col">
          <div className="p-3 border-b bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Files</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowNewFileModal(true)}
                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                title="New File"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                title="Upload File"
              >
                <UploadCloud size={16} />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                accept=".md,.txt,.json,.js,.jsx,.ts,.tsx"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {organizedTree.map(item => (
              <FileTreeItem
                key={item.path}
                item={item}
                activePath={activeFile?.path}
                onSelect={(f) => {
                  setViewMode('editor');
                  fetchFileContent(f.path, f.sha);
                }}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
              />
            ))}
            {organizedTree.length === 0 && !loading && (
              <div className="text-slate-400 text-sm p-4 text-center italic">No files found.</div>
            )}
          </div>
        </aside>

        {/* EDITOR AREA */}
        <main className="flex-1 flex flex-col bg-slate-50 relative">
          {activeFile ? (
            <>
              {/* TOOLBAR */}
              <div className="bg-white border-b px-4 py-2 flex items-center justify-between h-14">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="font-mono text-sm text-slate-600 truncate">{activeFile.path}</span>
                  {fileContent !== originalContent && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Unsaved Changes</span>
                  )}
                  {activeFile.sha === null && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">New File</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex bg-slate-100 rounded p-1 mr-4">
                    <button
                      onClick={() => { setViewMode('editor'); setIsEditing(true); }}
                      className={`px-3 py-1 rounded text-sm font-medium flex items-center gap-2 ${viewMode === 'editor' && isEditing ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <Edit3 size={14} /> Edit
                    </button>
                    <button
                      onClick={() => { setViewMode('editor'); setIsEditing(false); }}
                      className={`px-3 py-1 rounded text-sm font-medium flex items-center gap-2 ${viewMode === 'editor' && !isEditing ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <Eye size={14} /> Preview
                    </button>
                    <button
                      onClick={() => fetchHistory(activeFile.path)}
                      disabled={!activeFile.sha} // Can't fetch history for a new file
                      className={`px-3 py-1 rounded text-sm font-medium flex items-center gap-2 ${viewMode === 'history' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700 disabled:opacity-50'}`}
                    >
                      <History size={14} /> History
                    </button>
                  </div>

                  <button
                    onClick={() => setShowCommitModal(true)}
                    disabled={fileContent === originalContent || loading}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
                  >
                    <Save size={16} />
                    Commit
                  </button>
                </div>
              </div>

              {/* CONTENT */}
              <div className="flex-1 overflow-auto p-6">
                {loading && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center">
                    <RefreshCw className="animate-spin text-blue-600" size={32} />
                  </div>
                )}

                {viewMode === 'editor' ? (
                  <div className="bg-white rounded-lg shadow-sm border min-h-full">
                    {isEditing ? (
                      <textarea
                        className="w-full h-full p-6 font-mono text-sm resize-none focus:outline-none rounded-lg"
                        value={fileContent}
                        onChange={(e) => setFileContent(e.target.value)}
                        spellCheck={false}
                      />
                    ) : (
                      <div className="prose max-w-none p-8">
                        {/* Simple Markdown Render - In production, use 'react-markdown' or 'marked' */}
                        {fileContent.split('\n').map((line, i) => (
                          <div key={i} className={line.startsWith('#') ? 'font-bold text-slate-800 my-2' : 'text-slate-600 my-1'}>
                            {line.startsWith('# ') ? <h1 className="text-2xl">{line.replace('# ', '')}</h1> :
                              line.startsWith('## ') ? <h2 className="text-xl">{line.replace('## ', '')}</h2> :
                                line}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500 font-medium border-b">
                        <tr>
                          <th className="px-6 py-3">Commit Message</th>
                          <th className="px-6 py-3">Author</th>
                          <th className="px-6 py-3">Date</th>
                          <th className="px-6 py-3 text-right">SHA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((commit, idx) => (
                          <tr key={commit.sha} className="border-b last:border-0 hover:bg-slate-50">
                            <td className="px-6 py-4 font-medium text-slate-900">{commit.commit.message}</td>
                            <td className="px-6 py-4 text-slate-600">{commit.commit.author.name}</td>
                            <td className="px-6 py-4 text-slate-500">{formatDate(commit.commit.author.date)}</td>
                            <td className="px-6 py-4 text-right font-mono text-xs text-slate-400">{commit.sha.substring(0, 7)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {history.length === 0 && <div className="p-8 text-center text-slate-400">No history available for this file.</div>}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <FileText size={48} className="mb-4 opacity-20" />
              <p>Select a file to view or create a new one</p>
            </div>
          )}
        </main>
      </div>

      {/* COMMIT MODAL */}
      {showCommitModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Commit Changes</h3>
              <button onClick={() => setShowCommitModal(false)} className="text-slate-400 hover:text-slate-700">×</button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                You are about to commit changes to <span className="font-mono font-bold bg-slate-100 px-1 rounded">{activeFile?.path}</span> on branch <span className="font-bold text-blue-600">{currentBranch}</span>.
              </p>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Commit Message</label>
              <textarea
                className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                rows="3"
                placeholder="What did you change?"
                value={commitMessage}
                onChange={e => setCommitMessage(e.target.value)}
              />
            </div>
            <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setShowCommitModal(false)}
                className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-200 font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-bold text-sm shadow-sm"
              >
                Commit & Push
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW FILE MODAL */}
      {showNewFileModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">New File</h3>
              <button onClick={() => setShowNewFileModal(false)} className="text-slate-400 hover:text-slate-700">×</button>
            </div>
            <div className="p-6">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">File Path</label>
              <input
                type="text"
                className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="docs/new-file.md"
                value={newFilePath}
                onChange={e => setNewFilePath(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-slate-400 mt-2">Use forward slashes ( / ) to create folders.</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setShowNewFileModal(false)}
                className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-200 font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewFile}
                disabled={!newFilePath}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-bold text-sm shadow-sm disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATIONS */}
      <Notification
        message={notification.message}
        type={notification.type}
        onClose={() => setNotification({ message: '' })}
      />
    </div>
  );
}