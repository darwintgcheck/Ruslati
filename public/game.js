const GamePage = {
  poller: null,
  lastSeenNumber: null,
  knownTicketPayouts: new Map(),

  numberStatusLabel(status) {
    if (status === 'active') {
      return 'Canlı çəkiliş';
    }
    if (status === 'waiting') {
      return 'Bilet satışı';
    }
    return 'Tamamlandı';
  },

  playBeep(type = 'draw') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === 'win') {
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(520, audioContext.currentTime);
      oscillator.frequency.linearRampToValueAtTime(760, audioContext.currentTime + 0.25);
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.55);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.58);
    } else {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(360, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.2);
    }
  },

  renderUserCard(user) {
    return App.renderProfileCard(user);
  },

  renderWinners(winners) {
    const winnersFeed = document.getElementById('winnersFeed');
    if (!winnersFeed) {
      return;
    }
    if (!winners || !winners.length) {
      winnersFeed.innerHTML = '<div class="mini-placeholder">Hələ qalib yoxdur.</div>';
      return;
    }
    winnersFeed.innerHTML = winners.slice().reverse().map((winner) => `
      <div class="winner-item">
        <strong>${winner.username}</strong>
        <small>${winner.prizeType} · Bilet #${winner.ticketId}</small>
        <div class="stat-row"><span>Məbləğ</span><strong>${App.formatCurrency(winner.amount)}</strong></div>
        <small>Nömrə: ${winner.numberAt || '—'} · ${App.formatDate(winner.createdAt)}</small>
      </div>
    `).join('');
  },

  renderDrawnNumbers(numbers, lastNumber) {
    const grid = document.getElementById('drawnNumbersGrid');
    if (!grid) {
      return;
    }
    const drawnSet = new Set(numbers || []);
    const html = [];
    for (let number = 1; number <= 90; number += 1) {
      const drawn = drawnSet.has(number);
      const isLast = number === lastNumber;
      html.push(`<div class="number-chip ${drawn ? 'drawn' : ''} ${isLast ? 'last-drawn' : ''}">${number}</div>`);
    }
    grid.innerHTML = html.join('');
  },

  renderTicket(ticket, currentDrawnNumbers) {
    const drawnSet = new Set(currentDrawnNumbers || []);
    const rows = ticket.card.grid.map((row) => `
      <div class="ticket-row">
        ${row.map((cell) => {
          if (cell === null) {
            return '<div class="ticket-cell empty">•</div>';
          }
          const marked = drawnSet.has(cell);
          return `<div class="ticket-cell ${marked ? 'marked' : ''}">${cell}</div>`;
        }).join('')}
      </div>
    `).join('');

    const payoutClass = (ticket.totalPayout || 0) > (this.knownTicketPayouts.get(ticket.id) || 0) ? 'payout-flash' : '';

    return `
      <div class="ticket-card ${payoutClass}" data-ticket-id="${ticket.id}">
        <div class="ticket-headline">
          <strong>Bilet #${ticket.id}</strong>
          <span class="ticket-status">${ticket.status}</span>
        </div>
        <div class="ticket-meta">Raund #${ticket.roundId} · ${App.formatDate(ticket.purchasedAt)}</div>
        <div class="ticket-grid">${rows}</div>
        <div class="payout-tag-list">
          <span class="payout-tag ${ticket.payouts.oneRow ? 'active' : ''}">Bir sıra</span>
          <span class="payout-tag ${ticket.payouts.twoRows ? 'active' : ''}">İki sıra</span>
          <span class="payout-tag ${ticket.payouts.fullHouse ? 'active' : ''}">Full House</span>
        </div>
        <div class="stat-row"><span>Uyğun nömrə</span><strong>${ticket.matchedNumbers.length}/15</strong></div>
        <div class="stat-row"><span>Toplam payout</span><strong>${App.formatCurrency(ticket.totalPayout)}</strong></div>
      </div>
    `;
  },

  async loadState() {
    try {
      const data = await App.request('/api/game/state');
      this.render(data);
    } catch (error) {
      App.showToast(error.message, 'error');
      if (error.message.toLowerCase().includes('giriş')) {
        window.location.href = '/login.html';
      }
    }
  },

  render(data) {
    const round = data.round;
    const lastNumber = round.numbersDrawn.length ? round.numbersDrawn[round.numbersDrawn.length - 1] : null;

    document.getElementById('gameStatusBadge').textContent = this.numberStatusLabel(round.status);
    document.getElementById('lastNumberBall').textContent = lastNumber || '--';
    document.getElementById('roundIdValue').textContent = `#${round.id}`;
    document.getElementById('remainingCountValue').textContent = String(round.remainingCount);
    document.getElementById('ticketPriceValue').textContent = App.formatCurrency(round.ticketPrice);

    document.getElementById('startRoundButton').disabled = round.status !== 'waiting';
    document.getElementById('startRoundButton').textContent = round.status === 'waiting' ? 'Raundu başlat' : 'Raund aktivdir';

    this.renderDrawnNumbers(round.numbersDrawn, lastNumber);
    document.getElementById('gameUserCard').innerHTML = this.renderUserCard(data.user);
    this.renderWinners(round.winners);

    const ticketsBoard = document.getElementById('ticketsBoard');
    if (!data.tickets.length) {
      ticketsBoard.innerHTML = '<div class="mini-placeholder">Cari raund üçün biletin yoxdur. Yuxarıdan bilet al.</div>';
    } else {
      ticketsBoard.innerHTML = data.tickets.map((ticket) => this.renderTicket(ticket, round.numbersDrawn)).join('');
    }

    if (lastNumber && this.lastSeenNumber !== null && this.lastSeenNumber !== lastNumber) {
      this.playBeep('draw');
    }

    data.tickets.forEach((ticket) => {
      const previousPayout = this.knownTicketPayouts.get(ticket.id) || 0;
      if ((ticket.totalPayout || 0) > previousPayout) {
        this.playBeep('win');
        App.showToast(`Bilet #${ticket.id} üçün payout: ${App.formatCurrency(ticket.totalPayout)}`);
      }
      this.knownTicketPayouts.set(ticket.id, ticket.totalPayout || 0);
    });

    this.lastSeenNumber = lastNumber;
  },

  bindBuyForm() {
    const form = document.getElementById('buyTicketsForm');
    if (!form) {
      return;
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const payload = {
        quantity: Number(formData.get('quantity') || 1)
      };
      try {
        const result = await App.request('/api/tickets/buy', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        App.showToast(result.message);
        await this.loadState();
      } catch (error) {
        App.showToast(error.message, 'error');
      }
    });
  },

  bindStartButton() {
    const button = document.getElementById('startRoundButton');
    if (!button) {
      return;
    }
    button.addEventListener('click', async () => {
      try {
        const result = await App.request('/api/game/start', {
          method: 'POST',
          body: JSON.stringify({})
        });
        App.showToast(result.message);
        await this.loadState();
      } catch (error) {
        App.showToast(error.message, 'error');
      }
    });
  },

  init() {
    this.bindBuyForm();
    this.bindStartButton();
    this.loadState();
    this.poller = setInterval(() => {
      this.loadState();
    }, 1800);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'game') {
    GamePage.init();
  }
});