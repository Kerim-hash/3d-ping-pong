// DOM overlay: scores, server marker, messages, shot readout, start/game-over panel.
export class Hud {
  constructor(root = document) {
    this.el = {
      scoreHuman: root.getElementById('score-human'),
      scoreAi: root.getElementById('score-ai'),
      serveHuman: root.getElementById('serve-human'),
      serveAi: root.getElementById('serve-ai'),
      difficulty: root.getElementById('difficulty-label'),
      message: root.getElementById('message'),
      messageSub: root.getElementById('message-sub'),
      shot: root.getElementById('shot'),
      hint: root.getElementById('hint'),
      overlay: root.getElementById('overlay'),
      overlayTitle: root.getElementById('overlay-title'),
      overlaySub: root.getElementById('overlay-sub'),
      buttons: root.querySelectorAll('[data-difficulty]'),
    };
    this.messageTimer = null;
    this.shotTimer = null;
    this.startHandler = null;
    this.el.buttons.forEach((b) => b.addEventListener('click', () => this.startHandler?.(b.dataset.difficulty)));
  }

  onStart(fn) {
    this.startHandler = fn;
  }

  setScores(human, ai) {
    this.el.scoreHuman.textContent = human;
    this.el.scoreAi.textContent = ai;
  }

  setServer(side) {
    this.el.serveHuman.classList.toggle('on', side === 1);
    this.el.serveAi.classList.toggle('on', side === -1);
  }

  setDifficulty(name) {
    this.el.difficulty.textContent = name.toUpperCase();
  }

  showMessage(text, sub = '', duration = 1400) {
    this.el.message.textContent = text;
    this.el.messageSub.textContent = sub;
    this.el.message.parentElement.classList.add('show');
    clearTimeout(this.messageTimer);
    if (duration > 0) {
      this.messageTimer = setTimeout(() => this.el.message.parentElement.classList.remove('show'), duration);
    }
  }

  hideMessage() {
    clearTimeout(this.messageTimer);
    this.el.message.parentElement.classList.remove('show');
  }

  showShot(spin, speed) {
    const kmh = Math.round(speed * 3.6);
    const rps = Math.round(spin.rps);
    const label = spin.type === 'flat' ? 'FLAT' : spin.type.toUpperCase();
    this.el.shot.textContent = spin.type === 'flat' ? `${label} · ${kmh} km/h` : `${label} · ${rps} rps · ${kmh} km/h`;
    this.el.shot.dataset.type = spin.type;
    this.el.shot.classList.add('show');
    clearTimeout(this.shotTimer);
    this.shotTimer = setTimeout(() => this.el.shot.classList.remove('show'), 1800);
  }

  setHint(text) {
    if (this.el.hint.textContent !== text) this.el.hint.textContent = text;
    this.el.hint.classList.toggle('show', Boolean(text));
  }

  showOverlay(title, sub) {
    this.el.overlayTitle.textContent = title;
    this.el.overlaySub.textContent = sub;
    this.el.overlay.classList.add('show');
  }

  hideOverlay() {
    this.el.overlay.classList.remove('show');
  }
}
