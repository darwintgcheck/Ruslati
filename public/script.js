const App = {
  state: {
    session: null,
    settings: null
  },

  async request(url, options = {}) {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json'
      },
      ...options
    });

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      const message = data && data.error ? data.error : 'Sorğu zamanı xəta baş verdi.';
      throw new Error(message);
    }
    return data;
  },

  formatCurrency(value) {
    return `${Number(value || 0).toLocaleString('az-AZ')} ₼`;
  },

  formatDate(value) {
    if (!value) {
      return '—';
    }
    return new Date(value).toLocaleString('az-AZ');
  },

  showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) {
      return;
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3200);
  },

  async loadSession() {
    const data = await this.request('/api/session');
    this.state.session = data;
    this.updateAuthUI();
    return data;
  },

  async loadSettings() {
    const settings = await this.request('/api/settings');
    this.state.settings = settings;
    return settings;
  },

  updateAuthUI() {
    const authenticated = !!(this.state.session && this.state.session.authenticated);
    document.querySelectorAll('.guest-only').forEach((element) => {
      element.classList.toggle('hidden', authenticated);
    });
    document.querySelectorAll('.auth-only').forEach((element) => {
      element.classList.toggle('hidden', !authenticated);
    });
  },

  bindLogout() {
    const logoutButton = document.getElementById('logoutButton');
    if (!logoutButton) {
      return;
    }
    logoutButton.addEventListener('click', async () => {
      try {
        await this.request('/api/logout', { method: 'POST' });
        this.showToast('Çıxış edildi.');
        setTimeout(() => {
          window.location.href = '/index.html';
        }, 600);
      } catch (error) {
        this.showToast(error.message, 'error');
      }
    });
  },

  requireAuthRedirect() {
    if (!this.state.session || !this.state.session.authenticated) {
      window.location.href = '/login.html';
      return true;
    }
    return false;
  },

  async initIndexPage() {
    const currentRoundCard = document.getElementById('currentRoundCard');
    const recentRoundsList = document.getElementById('recentRoundsList');
    if (!currentRoundCard || !recentRoundsList) {
      return;
    }

    try {
      const lobby = await this.request('/api/lobby');
      const round = lobby.currentRound;
      currentRoundCard.innerHTML = `
        <div class="stat-row"><span>Status</span><strong>${round.status === 'active' ? 'Canlı' : 'Gözləmədə'}</strong></div>
        <div class="stat-row"><span>Raund ID</span><strong>#${round.id}</strong></div>
        <div class="stat-row"><span>Bilet qiyməti</span><strong>${this.formatCurrency(round.ticketPrice)}</strong></div>
        <div class="stat-row"><span>Oyunçu</span><strong>${round.players}</strong></div>
        <div class="stat-row"><span>Biletlər</span><strong>${round.totalTickets}</strong></div>
        <div class="stat-row"><span>Çəkilən nömrə</span><strong>${round.numbersDrawn.length}</strong></div>
        <div class="action-bar lowered">
          <a href="/game.html" class="gold-button full-width">Oyun masasına keç</a>
        </div>
      `;

      if (!lobby.recentRounds.length) {
        recentRoundsList.innerHTML = '<div class="mini-placeholder">Tamamlanmış raund yoxdur.</div>';
        return;
      }

      recentRoundsList.innerHTML = lobby.recentRounds.map((item) => `
        <div class="history-item">
          <strong>Raund #${item.id}</strong>
          <small>${this.formatDate(item.completedAt || item.createdAt)}</small>
          <div class="stat-row"><span>Qaliblər</span><strong>${item.winners.length}</strong></div>
          <div class="stat-row"><span>Pot</span><strong>${this.formatCurrency(item.stats.totalPot)}</strong></div>
        </div>
      `).join('');
    } catch (error) {
      currentRoundCard.innerHTML = `<p>${error.message}</p>`;
      recentRoundsList.innerHTML = `<div class="mini-placeholder">${error.message}</div>`;
    }
  },

  bindAuthForms() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const authMessage = document.getElementById('authMessage');

    if (loginForm) {
      loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(loginForm);
        const payload = Object.fromEntries(formData.entries());
        try {
          const result = await this.request('/api/login', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          if (authMessage) {
            authMessage.textContent = result.message;
          }
          this.showToast('Giriş uğurludur.');
          setTimeout(() => {
            window.location.href = result.user.isAdmin ? '/dashboard.html' : '/dashboard.html';
          }, 650);
        } catch (error) {
          if (authMessage) {
            authMessage.textContent = error.message;
          }
          this.showToast(error.message, 'error');
        }
      });
    }

    if (registerForm) {
      registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(registerForm);
        const payload = Object.fromEntries(formData.entries());
        try {
          const result = await this.request('/api/register', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          if (authMessage) {
            authMessage.textContent = result.message;
          }
          this.showToast('Qeydiyyat tamamlandı.');
          setTimeout(() => {
            window.location.href = '/dashboard.html';
          }, 650);
        } catch (error) {
          if (authMessage) {
            authMessage.textContent = error.message;
          }
          this.showToast(error.message, 'error');
        }
      });
    }
  },

  renderProfileCard(user) {
    return `
      <h3 class="profile-name">${user.username}</h3>
      <p class="muted-label">${user.isAdmin ? 'Administrator hesabı' : 'İstifadəçi hesabı'}</p>
      <div class="wallet-grid">
        <div class="wallet-box">
          <span>Əsas balans</span>
          <strong>${this.formatCurrency(user.balance)}</strong>
        </div>
        <div class="wallet-box">
          <span>Bonus balansı</span>
          <strong>${this.formatCurrency(user.bonusBalance)}</strong>
        </div>
      </div>
      <div class="stat-stack lowered">
        <div class="stat-row"><span>Alınan bilet</span><strong>${user.stats.ticketsBought || 0}</strong></div>
        <div class="stat-row"><span>Toplam xərclənib</span><strong>${this.formatCurrency(user.stats.totalSpent)}</strong></div>
        <div class="stat-row"><span>Toplam qazanılıb</span><strong>${this.formatCurrency(user.stats.totalWon)}</strong></div>
        <div class="stat-row"><span>Ən böyük uduş</span><strong>${this.formatCurrency(user.stats.biggestWin)}</strong></div>
      </div>
    `;
  },

  renderRoundCard(round) {
    if (!round) {
      return '<div class="mini-placeholder">Raund tapılmadı.</div>';
    }
    return `
      <div class="stat-row"><span>Raund ID</span><strong>#${round.id}</strong></div>
      <div class="stat-row"><span>Status</span><strong>${round.status === 'active' ? 'Canlı çəkiliş' : round.status === 'waiting' ? 'Bilet satışı' : 'Tamamlandı'}</strong></div>
      <div class="stat-row"><span>Bilet qiyməti</span><strong>${this.formatCurrency(round.ticketPrice)}</strong></div>
      <div class="stat-row"><span>Çəkilən nömrə</span><strong>${round.numbersDrawn.length}</strong></div>
      <div class="stat-row"><span>Pot</span><strong>${this.formatCurrency(round.stats.totalPot)}</strong></div>
      <div class="stat-row"><span>Son nömrə</span><strong>${round.stats.lastNumber || '—'}</strong></div>
    `;
  },

  renderCompactTicket(ticket) {
    return `
      <div class="ticket-card">
        <div class="ticket-headline">
          <strong>Bilet #${ticket.id}</strong>
          <span class="ticket-status">${ticket.status}</span>
        </div>
        <div class="ticket-meta">Raund #${ticket.roundId} · ${this.formatDate(ticket.purchasedAt)}</div>
        <div class="stat-row"><span>Ödəniş</span><strong>${this.formatCurrency(ticket.price)}</strong></div>
        <div class="stat-row"><span>Qazanc</span><strong>${this.formatCurrency(ticket.totalPayout)}</strong></div>
        <div class="stat-row"><span>Uyğun nömrə</span><strong>${ticket.matchedNumbers.length}/15</strong></div>
      </div>
    `;
  },

  async initDashboardPage() {
    const profile = document.getElementById('dashboardProfile');
    const currentRound = document.getElementById('dashboardCurrentRound');
    const ticketsBox = document.getElementById('dashboardTickets');
    const roundsBox = document.getElementById('dashboardRounds');
    if (!profile || !currentRound || !ticketsBox || !roundsBox) {
      return;
    }

    try {
      const data = await this.request('/api/dashboard');
      profile.innerHTML = this.renderProfileCard(data.user);
      currentRound.innerHTML = this.renderRoundCard(data.currentRound);

      ticketsBox.innerHTML = data.tickets.length
        ? data.tickets.map((ticket) => this.renderCompactTicket(ticket)).join('')
        : '<div class="mini-placeholder">Hələ bilet almamısan.</div>';

      roundsBox.innerHTML = data.rounds.length
        ? data.rounds.map((round) => `
            <div class="history-item">
              <strong>Raund #${round.id}</strong>
              <small>${this.formatDate(round.completedAt || round.createdAt)}</small>
              <div class="stat-row"><span>Status</span><strong>${round.status}</strong></div>
              <div class="stat-row"><span>Qalib hadisələri</span><strong>${round.winners.length}</strong></div>
              <div class="stat-row"><span>Payout</span><strong>${this.formatCurrency(round.stats.totalPayout)}</strong></div>
            </div>
          `).join('')
        : '<div class="mini-placeholder">Tarixçə tapılmadı.</div>';
    } catch (error) {
      this.showToast(error.message, 'error');
      if (error.message.toLowerCase().includes('giriş')) {
        window.location.href = '/login.html';
      }
    }
  },

  async init() {
    this.bindLogout();
    this.bindAuthForms();
    try {
      await Promise.all([this.loadSession(), this.loadSettings()]);
    } catch (error) {
      this.showToast(error.message, 'error');
    }

    const page = document.body.dataset.page;
    if (page === 'index') {
      this.initIndexPage();
    }
    if (page === 'dashboard') {
      if (this.requireAuthRedirect()) {
        return;
      }
      this.initDashboardPage();
    }
    if (page === 'admin' || page === 'game') {
      if (this.requireAuthRedirect()) {
        return;
      }
    }
  }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});