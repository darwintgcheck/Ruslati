const AdminPage = {
  async loadOverview() {
    try {
      const data = await App.request('/api/admin/overview');
      this.render(data);
    } catch (error) {
      App.showToast(error.message, 'error');
      window.location.href = '/login.html';
    }
  },

  render(data) {
    document.getElementById('statUsers').innerHTML = `<strong>${data.totals.users}</strong><span>Ümumi hesab</span>`;
    document.getElementById('statTickets').innerHTML = `<strong>${data.totals.totalTickets}</strong><span>Ümumi bilet</span>`;
    document.getElementById('statSales').innerHTML = `<strong>${App.formatCurrency(data.totals.totalTicketSales)}</strong><span>Bilet satışları</span>`;
    document.getElementById('statPayout').innerHTML = `<strong>${App.formatCurrency(data.totals.totalPayout)}</strong><span>Toplam payout</span>`;

    const settingsForm = document.getElementById('settingsForm');
    settingsForm.ticketPrice.value = data.settings.ticketPrice;
    settingsForm.welcomeBonus.value = data.settings.welcomeBonus;
    settingsForm.startingBalance.value = data.settings.startingBalance;
    settingsForm.rowMultiplier.value = data.settings.rowMultiplier;
    settingsForm.twoRowMultiplier.value = data.settings.twoRowMultiplier;
    settingsForm.fullHouseMultiplier.value = data.settings.fullHouseMultiplier;
    settingsForm.autoDrawIntervalMs.value = data.settings.autoDrawIntervalMs;
    settingsForm.allowSelfStart.value = String(data.settings.allowSelfStart);

    const userRows = data.users.map((user) => `
      <tr>
        <td>${user.id}</td>
        <td>${user.username}${user.isAdmin ? ' <strong>(admin)</strong>' : ''}</td>
        <td>${App.formatCurrency(user.balance)}</td>
        <td>${App.formatCurrency(user.bonusBalance)}</td>
        <td>${user.stats.ticketsBought || 0}</td>
        <td>${App.formatCurrency(user.stats.totalWon)}</td>
      </tr>
    `).join('');

    document.getElementById('adminUsers').innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>İstifadəçi</th>
            <th>Əsas balans</th>
            <th>Bonus</th>
            <th>Bilet</th>
            <th>Qazanc</th>
          </tr>
        </thead>
        <tbody>${userRows}</tbody>
      </table>
    `;

    const drawsBox = document.getElementById('adminDraws');
    if (!data.draws.length) {
      drawsBox.innerHTML = '<div class="mini-placeholder">Raund tapılmadı.</div>';
      return;
    }

    drawsBox.innerHTML = data.draws.map((draw) => `
      <div class="history-item">
        <strong>Raund #${draw.id}</strong>
        <small>${App.formatDate(draw.createdAt)}</small>
        <div class="stat-row"><span>Status</span><strong>${draw.status}</strong></div>
        <div class="stat-row"><span>Pot</span><strong>${App.formatCurrency(draw.stats.totalPot)}</strong></div>
        <div class="stat-row"><span>Payout</span><strong>${App.formatCurrency(draw.stats.totalPayout)}</strong></div>
        <div class="stat-row"><span>Çəkilən nömrə</span><strong>${draw.numbersDrawn.length}</strong></div>
        <div class="stat-row"><span>Qalib hadisələri</span><strong>${draw.winners.length}</strong></div>
      </div>
    `).join('');
  },

  bindForms() {
    const settingsForm = document.getElementById('settingsForm');
    const creditForm = document.getElementById('creditForm');

    settingsForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(settingsForm).entries());
      try {
        const result = await App.request('/api/admin/settings', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        App.showToast(result.message);
        await this.loadOverview();
      } catch (error) {
        App.showToast(error.message, 'error');
      }
    });

    creditForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(creditForm).entries());
      try {
        const result = await App.request('/api/admin/credit', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        App.showToast(`${result.user.username} üçün balans yeniləndi.`);
        creditForm.reset();
        await this.loadOverview();
      } catch (error) {
        App.showToast(error.message, 'error');
      }
    });
  },

  init() {
    this.bindForms();
    this.loadOverview();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'admin') {
    AdminPage.init();
  }
});