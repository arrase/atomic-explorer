export type TabId =
  | 'periodic-table'
  | 'orbitals'
  | 'bonding'
  | 'molecules'
  | 'spectroscopy'
  | 'nucleus'
  | 'history';

export const VALID_TABS: readonly TabId[] = [
  'periodic-table',
  'orbitals',
  'bonding',
  'molecules',
  'spectroscopy',
  'nucleus',
  'history',
];

export type OrbitalModeParam = 'points' | 'isosurface' | 'raymarching';
export type CutAxisParam = 'none' | 'x' | 'y' | 'z';
export type BlockFilterParam = 'all' | 's' | 'p' | 'd' | 'f';
export type HistoryEraParam = 'dalton' | 'thomson' | 'rutherford' | 'bohr' | 'schrodinger';

export type DeepLinkState =
  | {
      tab: 'periodic-table';
      el?: number;
      block?: BlockFilterParam;
      colorScheme?: string;
    }
  | {
      tab: 'orbitals';
      n?: number;
      l?: number;
      m?: number;
      zEff?: number;
      mode?: OrbitalModeParam;
      useRealOrbital?: boolean;
      cut?: CutAxisParam;
      nodal?: boolean;
    }
  | {
      tab: 'bonding';
      preset?: string;
      r?: number;
      anti?: boolean;
    }
  | {
      tab: 'molecules';
      mol?: string;
    }
  | {
      tab: 'spectroscopy';
      el?: number;
      n1?: number;
      n2?: number;
    }
  | {
      tab: 'nucleus';
      z?: number;
      n?: number;
    }
  | {
      tab: 'history';
      era?: HistoryEraParam;
    };

export interface UrlSyncController {
  /** Debounced replaceState (default 250ms) so dragging sliders never spams history. */
  sync(state: DeepLinkState): void;
  /** Immediate replaceState + cancels pending timer (call right before clipboard copy). */
  flush(state: DeepLinkState): void;
}

const VALID_ORBITAL_MODES: readonly OrbitalModeParam[] = ['points', 'isosurface', 'raymarching'];
const VALID_CUT_AXES: readonly CutAxisParam[] = ['none', 'x', 'y', 'z'];
const VALID_BLOCKS: readonly BlockFilterParam[] = ['all', 's', 'p', 'd', 'f'];
const VALID_HISTORY_ERAS: readonly HistoryEraParam[] = [
  'dalton',
  'thomson',
  'rutherford',
  'bohr',
  'schrodinger',
];
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function setParam(params: URLSearchParams, key: string, value: string | number | undefined): void {
  if (value !== undefined) {
    params.set(key, String(value));
  }
}

function assignDefined<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function parseClampedInt(raw: string | null, min: number, max: number): number | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  const clamped = Math.min(max, Math.max(min, Math.trunc(value)));
  return clamped === 0 ? 0 : clamped;
}

function parseClampedFloat(raw: string | null, min: number, max: number): number | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

function parseEnum<T extends string>(raw: string | null, allowed: readonly T[]): T | undefined {
  if (raw === null) return undefined;
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

function parseBoolFlag(raw: string | null): boolean | undefined {
  if (raw === '1') return true;
  if (raw === '0') return false;
  return undefined;
}

function parseToken(raw: string | null): string | undefined {
  if (raw === null || !SAFE_TOKEN_PATTERN.test(raw)) return undefined;
  return raw;
}

function encodePeriodicTable(
  params: URLSearchParams,
  state: Extract<DeepLinkState, { tab: 'periodic-table' }>,
): void {
  setParam(params, 'el', state.el);
  if (state.block !== undefined && state.block !== 'all') {
    params.set('block', state.block);
  }
  if (state.colorScheme !== undefined && state.colorScheme !== 'category') {
    params.set('color', state.colorScheme);
  }
}

function encodeOrbitals(
  params: URLSearchParams,
  state: Extract<DeepLinkState, { tab: 'orbitals' }>,
): void {
  setParam(params, 'n', state.n);
  setParam(params, 'l', state.l);
  setParam(params, 'm', state.m);
  setParam(params, 'z', state.zEff !== undefined ? round2(state.zEff) : undefined);
  setParam(params, 'mode', state.mode);
  if (state.useRealOrbital !== undefined) {
    params.set('real', state.useRealOrbital ? '1' : '0');
  }
  if (state.cut !== undefined && state.cut !== 'none') {
    params.set('cut', state.cut);
  }
  if (state.nodal === true) {
    params.set('nodal', '1');
  }
}

function encodeBonding(
  params: URLSearchParams,
  state: Extract<DeepLinkState, { tab: 'bonding' }>,
): void {
  setParam(params, 'preset', state.preset);
  setParam(params, 'r', state.r !== undefined ? round2(state.r) : undefined);
  if (state.anti !== undefined) {
    params.set('anti', state.anti ? '1' : '0');
  }
}

function encodeMolecules(
  params: URLSearchParams,
  state: Extract<DeepLinkState, { tab: 'molecules' }>,
): void {
  setParam(params, 'mol', state.mol);
}

function encodeSpectroscopy(
  params: URLSearchParams,
  state: Extract<DeepLinkState, { tab: 'spectroscopy' }>,
): void {
  setParam(params, 'el', state.el);
  setParam(params, 'n1', state.n1);
  setParam(params, 'n2', state.n2);
}

function encodeNucleus(
  params: URLSearchParams,
  state: Extract<DeepLinkState, { tab: 'nucleus' }>,
): void {
  setParam(params, 'z', state.z);
  setParam(params, 'n', state.n);
}

function encodeHistory(
  params: URLSearchParams,
  state: Extract<DeepLinkState, { tab: 'history' }>,
): void {
  setParam(params, 'era', state.era);
}

function parsePeriodicTable(params: URLSearchParams): DeepLinkState {
  const state: Extract<DeepLinkState, { tab: 'periodic-table' }> = { tab: 'periodic-table' };
  assignDefined(state, 'el', parseClampedInt(params.get('el'), 1, 118));
  assignDefined(state, 'block', parseEnum(params.get('block'), VALID_BLOCKS));
  assignDefined(state, 'colorScheme', parseToken(params.get('color')));
  return state;
}

function parseOrbitals(params: URLSearchParams): DeepLinkState {
  const n = parseClampedInt(params.get('n'), 1, 7);
  const useRealOrbital = parseBoolFlag(params.get('real'));
  const effN = n ?? 7;
  const maxL = useRealOrbital === false ? effN - 1 : Math.min(effN - 1, 3);
  const l = parseClampedInt(params.get('l'), 0, maxL);
  const maxM = l ?? maxL;

  const state: Extract<DeepLinkState, { tab: 'orbitals' }> = { tab: 'orbitals' };
  assignDefined(state, 'n', n);
  assignDefined(state, 'l', l);
  assignDefined(state, 'm', parseClampedInt(params.get('m'), -maxM, maxM));
  assignDefined(state, 'zEff', parseClampedFloat(params.get('z'), 0.1, 118));
  assignDefined(state, 'mode', parseEnum(params.get('mode'), VALID_ORBITAL_MODES));
  assignDefined(state, 'useRealOrbital', useRealOrbital);
  assignDefined(state, 'cut', parseEnum(params.get('cut'), VALID_CUT_AXES));
  assignDefined(state, 'nodal', parseBoolFlag(params.get('nodal')));
  return state;
}

function parseBonding(params: URLSearchParams): DeepLinkState {
  const state: Extract<DeepLinkState, { tab: 'bonding' }> = { tab: 'bonding' };
  assignDefined(state, 'preset', parseToken(params.get('preset')));
  assignDefined(state, 'r', parseClampedFloat(params.get('r'), 0.2, 12));
  assignDefined(state, 'anti', parseBoolFlag(params.get('anti')));
  return state;
}

function parseMolecules(params: URLSearchParams): DeepLinkState {
  const state: Extract<DeepLinkState, { tab: 'molecules' }> = { tab: 'molecules' };
  assignDefined(state, 'mol', parseToken(params.get('mol')));
  return state;
}

function parseSpectroscopy(params: URLSearchParams): DeepLinkState {
  const state: Extract<DeepLinkState, { tab: 'spectroscopy' }> = { tab: 'spectroscopy' };
  assignDefined(state, 'el', parseClampedInt(params.get('el'), 1, 118));
  assignDefined(state, 'n1', parseClampedInt(params.get('n1'), 1, 7));
  assignDefined(state, 'n2', parseClampedInt(params.get('n2'), 1, 7));
  return state;
}

function parseNucleus(params: URLSearchParams): DeepLinkState {
  const state: Extract<DeepLinkState, { tab: 'nucleus' }> = { tab: 'nucleus' };
  assignDefined(state, 'z', parseClampedInt(params.get('z'), 1, 118));
  assignDefined(state, 'n', parseClampedInt(params.get('n'), 0, 180));
  return state;
}

function parseHistory(params: URLSearchParams): DeepLinkState {
  const state: Extract<DeepLinkState, { tab: 'history' }> = { tab: 'history' };
  assignDefined(state, 'era', parseEnum(params.get('era'), VALID_HISTORY_ERAS));
  return state;
}

type TabEncoderMap = {
  [K in TabId]: (params: URLSearchParams, state: Extract<DeepLinkState, { tab: K }>) => void;
};

const TAB_ENCODERS: TabEncoderMap = {
  'periodic-table': encodePeriodicTable,
  orbitals: encodeOrbitals,
  bonding: encodeBonding,
  molecules: encodeMolecules,
  spectroscopy: encodeSpectroscopy,
  nucleus: encodeNucleus,
  history: encodeHistory,
};

const TAB_DECODERS: Record<TabId, (params: URLSearchParams) => DeepLinkState> = {
  'periodic-table': parsePeriodicTable,
  orbitals: parseOrbitals,
  bonding: parseBonding,
  molecules: parseMolecules,
  spectroscopy: parseSpectroscopy,
  nucleus: parseNucleus,
  history: parseHistory,
};

export function encodeUrlState(state: DeepLinkState): string {
  const params = new URLSearchParams();
  params.set('tab', state.tab);
  const encode = TAB_ENCODERS[state.tab] as (
    params: URLSearchParams,
    state: DeepLinkState,
  ) => void;
  encode(params, state);
  return `?${params.toString()}`;
}

export function parseUrlState(search: string): DeepLinkState | null {
  const params = new URLSearchParams(search);
  const tab = parseEnum(params.get('tab'), VALID_TABS);
  if (tab === undefined) return null;
  return TAB_DECODERS[tab](params);
}

function replaceBrowserUrl(state: DeepLinkState): void {
  const win = globalThis.window;
  if (!win) return;
  const nextUrl = `${win.location.pathname}${encodeUrlState(state)}${win.location.hash}`;
  win.history.replaceState(null, '', nextUrl);
}

export function createUrlSync(debounceMs = 250): UrlSyncController {
  let timerId: number | undefined;

  const cancelPending = (): void => {
    if (timerId !== undefined) {
      globalThis.window?.clearTimeout(timerId);
      timerId = undefined;
    }
  };

  return {
    sync(state: DeepLinkState): void {
      const win = globalThis.window;
      if (!win) return;
      cancelPending();
      timerId = win.setTimeout(() => {
        timerId = undefined;
        replaceBrowserUrl(state);
      }, debounceMs);
    },
    flush(state: DeepLinkState): void {
      cancelPending();
      replaceBrowserUrl(state);
    },
  };
}
