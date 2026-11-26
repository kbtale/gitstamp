import { ContributionLevel } from '../types';
import { renderTextToMatrix } from './pixel-text';

export interface StarterPreset {
  id: string;
  name: string;
  matrix: ContributionLevel[][];
}

function parsePattern(lines: string[]): ContributionLevel[][] {
  const height = 7;
  const width = Math.max(1, Math.min(53, ...lines.map((l) => l.length)));
  const matrix: ContributionLevel[][] = Array.from({ length: height }, () =>
    new Array<ContributionLevel>(width).fill(0)
  );

  for (let r = 0; r < Math.min(height, lines.length); r++) {
    for (let c = 0; c < Math.min(width, lines[r].length); c++) {
      const ch = lines[r][c];
      const parsed = Number(ch);
      if (parsed >= 1 && parsed <= 4) {
        matrix[r][c] = parsed as ContributionLevel;
      }
    }
  }

  return matrix;
}

export const STARTER_PRESETS: StarterPreset[] = [
  {
    id: 'heart',
    name: 'Heart',
    matrix: parsePattern([
      '.343.343.',
      '344434443',
      '444444444',
      '344444443',
      '.2344432.',
      '..12421..',
      '...121...'
    ])
  },
  {
    id: 'invader',
    name: 'Invader',
    matrix: parsePattern([
      '..4.....4..',
      '...4...4...',
      '..4444444..',
      '.442444244.',
      '44444444444',
      '4.4444444.4',
      '4.4.....4.4'
    ])
  },
  {
    id: 'rocket',
    name: 'Rocket',
    matrix: parsePattern([
      '....234432....',
      '...24444442...',
      '..1442112441..',
      '12344444444321',
      '..1442112441..',
      '...24444442...',
      '....234432....'
    ])
  },
  {
    id: 'wave',
    name: 'Wave',
    matrix: parsePattern([
      '..343.......343.......343...',
      '.24442.....24442.....24442..',
      '1342431...1342431...1342431.',
      '242.242...242.242...242.242.',
      '42...241.142...241.142...241',
      '2.....24342.....24342.....24',
      '.......242.......242.......2'
    ])
  },
  {
    id: 'pacman',
    name: 'Pac-Man',
    matrix: parsePattern([
      '..4444........2332..',
      '.444444......244442.',
      '44444........414414.',
      '444....2..2..444444.',
      '44444........444444.',
      '.444444......444444.',
      '..4444.......4.44.4.'
    ])
  },
  {
    id: 'octocat',
    name: 'Octocat',
    matrix: parsePattern([
      '.4.....4.',
      '.4444444.',
      '442444244',
      '444444444',
      '.4444444.',
      '..34443..',
      '.2.3.3.2.'
    ])
  },
  {
    id: 'knight',
    name: 'Knight',
    matrix: parsePattern([
      '..3443..',
      '.442444.',
      '44444444',
      '.33.444.',
      '...444..',
      '..44444.',
      '.4444444'
    ])
  },
  {
    id: 'checkered',
    name: 'Checkered',
    matrix: parsePattern([
      '4.3.2.1.2.3.4.3.2.1.2.3.4',
      '.4.3.2.1.2.3.4.3.2.1.2.3.',
      '4.3.2.1.2.3.4.3.2.1.2.3.4',
      '.4.3.2.1.2.3.4.3.2.1.2.3.',
      '4.3.2.1.2.3.4.3.2.1.2.3.4',
      '.4.3.2.1.2.3.4.3.2.1.2.3.',
      '4.3.2.1.2.3.4.3.2.1.2.3.4'
    ])
  },
  {
    id: 'hire-me',
    name: 'HIRE ME',
    matrix: renderTextToMatrix('HIRE ME', { shade: 4, spacing: 1 })
  }
];
