
import { getCensorLyrics, getAllowMild } from '../pages/settings.js';

const STRONG = [
  '\\w*f+u+c+k+\\w*',
  'f+u+k+(?:ing|in|ed|er|s)?',
  '\\w*shit\\w*',
  '\\w*bitch\\w*',
  'nigg\\w*',
  'puss(?:y|ies)',
  'dick(?:s|head|heads)?',
  'cock(?:s|sucker\\w*)?',
  'cunt\\w*',
  'whore\\w*',
  'slut\\w*',
  'fag(?:s|got|gots)?',
  'retard(?:s|ed)?',
  'asshole\\w*',
  'tit(?:s|ties)',
];

const MILD = [
  '(?:god)?damn\\w*',
  'dammit',
  'hell',
  'ass(?:es)?',
  '(?:dumb|bad|jack|smart|kick|lame|fat|half|hard|broke|tight)ass(?:es)?',
  'crap\\w*',
  'bastard\\w*',
  'piss\\w*',
  'hoe(?:s)?',
];

const wrap = (list) => new RegExp('(?<![A-Za-z0-9])(?:' + list.join('|') + ')(?![A-Za-z0-9])', 'gi');
const STRONG_RE = wrap(STRONG);
const MILD_RE = wrap(MILD);

const stars = (m) => m.replace(/[A-Za-z0-9]/g, '*');

export function censor(text) {
  if (!text || !getCensorLyrics()) return text;
  let out = String(text).replace(STRONG_RE, stars);
  if (!getAllowMild()) out = out.replace(MILD_RE, stars);
  return out;
}
