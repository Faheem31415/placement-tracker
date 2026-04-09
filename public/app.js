const API_URL = '/api/applications';
let applications = [];
let isLoginMode = true;

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    
    // Auth Events
    document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);
    document.getElementById('auth-toggle-btn').addEventListener('click', toggleAuthMode);
    document.getElementById('logout-btn').addEventListener('click', logout);
    
    // Core App Events
    document.getElementById('app-form').addEventListener('submit', handleAddApplication);
    document.getElementById('search').addEventListener('input', handleFilterApplications);
});

// --- 1. AUTHENTICATION LOGIC ---

function checkAuthStatus() {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    
    if (token) {
        // Logged in: Show dashboard
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        document.getElementById('user-display-name').textContent = username;
        fetchApplications(); // Fetch only this user's data
    } else {
        // Not logged in: Show auth screen
        document.getElementById('auth-overlay').style.display = 'flex';
        document.getElementById('dashboard').style.display = 'none';
    }
}

function toggleAuthMode(e) {
    if(e) e.preventDefault();
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? 'Welcome Back' : 'Create Account';
    document.getElementById('auth-subtitle').innerText = isLoginMode ? 'Login to manage your applications' : 'Sign up to track your placements';
    document.getElementById('auth-btn').innerText = isLoginMode ? 'Login to Dashboard' : 'Register Now';
    document.getElementById('auth-toggle-text').innerText = isLoginMode ? "Don't have an account?" : "Already have an account?";
    document.getElementById('auth-toggle-btn').innerText = isLoginMode ? 'Register here' : 'Login here';
    document.getElementById('auth-error').innerText = ''; 
    document.getElementById('auth-error').style.color = "var(--danger)";
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('auth-btn');
    const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
    
    const payload = {
        username: document.getElementById('auth-username').value,
        password: document.getElementById('auth-password').value
    };
    
    btn.innerText = 'Please wait...';
    document.getElementById('auth-error').innerText = '';
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || data.error || "Something went wrong.");
        }
        
        if (isLoginMode) {
            // Save JWT Token
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);
            document.getElementById('auth-form').reset();
            checkAuthStatus();
        } else {
            // Successfully Registered! Switch to login mode
            document.getElementById('auth-error').style.color = 'var(--success)';
            document.getElementById('auth-error').innerText = 'Registration successful! Please login.';
            isLoginMode = false; // toggleAuthMode will flip it to true
            toggleAuthMode(); 
        }
    } catch (err) {
        document.getElementById('auth-error').style.color = 'var(--danger)';
        document.getElementById('auth-error').innerText = err.message;
    } finally {
        btn.innerText = isLoginMode ? 'Login to Dashboard' : 'Register Now';
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    checkAuthStatus();
}

// Helper wrapper to easily inject our JWT Token into outgoing requests
function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('token');
    return fetch(url, {
        ...options,
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
            ...options.headers
        }
    });
}

// --- 2. CORE APP LOGIC ---

async function fetchApplications() {
    try {
        const response = await authenticatedFetch(API_URL);
        
        if(response.status === 401 || response.status === 403) {
            return logout(); // Token expired or invalid, auto logout
        }
        
        applications = await response.json();
        renderApplications(applications);
        updateStatistics();
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

async function handleAddApplication(e) {
    e.preventDefault(); 
    
    const btn = e.target.querySelector('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = `Saving...`;
    
    const newApp = {
        company: document.getElementById('company').value,
        role: document.getElementById('role').value,
        date: document.getElementById('date').value,
        status: document.getElementById('status').value,
        notes: document.getElementById('notes').value
    };

    try {
        const response = await authenticatedFetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(newApp)
        });
        
        if(response.status === 401 || response.status === 403) return logout();
        
        const addedApp = await response.json();
        applications.push(addedApp);
        document.getElementById('app-form').reset();
        
        btn.innerHTML = originalText;
        renderApplications(applications);
        updateStatistics();
    } catch (error) {
        console.error('Error adding:', error);
        btn.innerHTML = originalText;
    }
}

async function deleteApplication(id) {
    if(!confirm("Permanently delete this record?")) return;

    const card = document.querySelector(`.app-card[data-id="${id}"]`);
    if(card) card.style.opacity = '0.5';

    try {
        await authenticatedFetch(`${API_URL}/${id}`, {
            method: 'DELETE'
        });
        
        applications = applications.filter(app => app.id !== id);
        renderApplications(applications);
        updateStatistics();
    } catch (error) {
        console.error('Error deleting:', error);
        if(card) card.style.opacity = '1';
    }
}

async function updateStatus(id, newStatus) {
    try {
        const response = await authenticatedFetch(`${API_URL}/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });
        
        const updatedApp = await response.json();
        const index = applications.findIndex(app => app.id === id);
        if(index !== -1) applications[index] = updatedApp;
        
        renderApplications(applications);
        updateStatistics();
    } catch (error) {
        console.error('Error updating:', error);
    }
}

function updateStatistics() {
    const total = applications.length;
    const selected = applications.filter(app => app.status === 'Selected').length;
    const rejected = applications.filter(app => app.status === 'Rejected').length;

    document.getElementById('total-count').textContent = total;
    document.getElementById('selected-count').textContent = selected;
    document.getElementById('rejected-count').textContent = rejected;
}

function handleFilterApplications(e) {
    const searchTerm = e.target.value.toLowerCase();
    const filteredApps = applications.filter(app => 
        app.company.toLowerCase().includes(searchTerm) || 
        app.role.toLowerCase().includes(searchTerm)
    );
    renderApplications(filteredApps);
}

function renderApplications(appsToRender) {
    const container = document.getElementById('apps-container');
    container.innerHTML = ''; 

    if (appsToRender.length === 0) {
        container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted); background: white; border-radius: 12px; border: 1px dashed var(--border-light);">
            <p>You haven't added any applications yet.</p>
        </div>`;
        return;
    }

    appsToRender.forEach((app, index) => {
        const card = document.createElement('div');
        card.className = 'app-card';
        card.setAttribute('data-id', app.id);
        
        card.innerHTML = `
            <div class="app-info">
                <div class="app-header">
                    <h3>${app.company}</h3>
                </div>
                <div class="app-role">
                    <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                    </svg>
                    ${app.role}
                </div>
                <div class="app-meta">
                    <div class="meta-item">
                        <svg class="meta-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                        ${app.date}
                    </div>
                </div>
                ${app.notes ? `<div class="app-notes">${app.notes}</div>` : ''}
            </div>
            
            <div class="app-actions">
                <span class="status-badge status-${app.status}">${app.status}</span>
                <div class="controls-row">
                    <select class="status-select" onchange="updateStatus('${app.id}', this.value)">
                        <option value="Applied" ${app.status === 'Applied' ? 'selected' : ''}>Applied</option>
                        <option value="Interviewing" ${app.status === 'Interviewing' ? 'selected' : ''}>Interviewing</option>
                        <option value="Selected" ${app.status === 'Selected' ? 'selected' : ''}>Selected</option>
                        <option value="Rejected" ${app.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
                    </select>
                    <button class="btn-icon" onclick="deleteApplication('${app.id}')" title="Delete">
                        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}
