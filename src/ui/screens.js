// Title, zone cards, control hints. Text appears like titles in a film: slow.
import { ZONES } from '../config.js';

const $ = (id) => document.getElementById(id);

export class Screens {
  constructor() {
    this.title = $('title');
    this.zone = $('zone');
    this.hint = $('hint');
    this.zoneTimer = null;
    this.hops = 0;
  }

  begin() {
    this.title.classList.add('gone');
    setTimeout(() => this.hint.classList.add('show'), 2500);
  }

  hopped() {
    this.hops++;
    if (this.hops === 6) this.hint.classList.remove('show');
  }

  showZone(i) {
    this.showCard(ZONES[i].name, ZONES[i].sub);
  }

  showCard(name, sub) {
    $('zone-name').textContent = name;
    $('zone-sub').textContent = sub;
    this.zone.classList.add('show');
    clearTimeout(this.zoneTimer);
    this.zoneTimer = setTimeout(() => this.zone.classList.remove('show'), 5200);
  }
}
