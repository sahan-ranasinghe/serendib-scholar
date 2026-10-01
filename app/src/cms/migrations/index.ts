import * as migration_20260930_103853_initial from './20260930_103853_initial';

export const migrations = [
  {
    up: migration_20260930_103853_initial.up,
    down: migration_20260930_103853_initial.down,
    name: '20260930_103853_initial'
  },
];
