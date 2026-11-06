// AI-assisted: Used Claude for the landing page visuals and animation
import { startHero } from './hero.js';
import { startProof } from './proof.js';
import { startJourney } from './journey.js';
import { startFx } from './fx.js';

startProof();
startJourney();
startFx();
startHero().catch((e) => {
  console.warn('[enigma]', e);
  document.documentElement.classList.remove('gl', 'intro-pending');
});
