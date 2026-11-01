import elementsData from '../../assets/data/elements.json';

export type Vec3Tuple = [number, number, number];
export type BondKind = 'single' | 'double' | 'triple' | 'aromatic';
export type PartialChargeSign = 'positive' | 'negative' | 'neutral';

export interface PolarityAtomInput {
  symbol: string;
  position: Vec3Tuple;
}

export interface PolarityBondInput {
  fromIndex: number;
  toIndex: number;
  type: BondKind;
}

export interface BondDipole {
  positiveAtomIndex: number;
  negativeAtomIndex: number;
  deltaChi: number;
  direction: Vec3Tuple;
  vector: Vec3Tuple;
}

export interface AtomPartialCharge {
  atomIndex: number;
  netShift: number;
  sign: PartialChargeSign;
}

export interface MolecularPolarityResult {
  isPolar: boolean;
  hasPolarBonds: boolean;
  cancelledBySymmetry: boolean;
  bondDipoles: BondDipole[];
  partialCharges: AtomPartialCharge[];
  netDipoleVector: Vec3Tuple;
  netDipoleMagnitude: number;
  centroid: Vec3Tuple;
}

export interface SigmaPiSummary {
  sigmaCount: number;
  piCount: number;
  isAromatic: boolean;
  hasPiSystem: boolean;
}

export const BOND_DIPOLE_THRESHOLD = 0.05;
export const NET_DIPOLE_THRESHOLD = 0.05;
export const PARTIAL_CHARGE_THRESHOLD = 0.05;

const ELECTRONEGATIVITY_BY_SYMBOL: ReadonlyMap<string, number> = new Map(
  elementsData.flatMap((el) =>
    typeof el.electronegativity === 'number' ? [[el.symbol, el.electronegativity] as const] : [],
  ),
);

function computeCentroid(atoms: readonly PolarityAtomInput[]): Vec3Tuple {
  if (atoms.length === 0) {
    return [0, 0, 0];
  }
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  for (const atom of atoms) {
    sumX += atom.position[0];
    sumY += atom.position[1];
    sumZ += atom.position[2];
  }
  const invCount = 1 / atoms.length;
  return [sumX * invCount, sumY * invCount, sumZ * invCount];
}

function classifyPartialCharge(netShift: number): PartialChargeSign {
  if (netShift >= PARTIAL_CHARGE_THRESHOLD) {
    return 'positive';
  }
  if (netShift <= -PARTIAL_CHARGE_THRESHOLD) {
    return 'negative';
  }
  return 'neutral';
}

function createBondDipole(
  atoms: readonly PolarityAtomInput[],
  fromIndex: number,
  toIndex: number,
  diff: number,
): BondDipole | null {
  const deltaChi = Math.abs(diff);
  if (deltaChi < BOND_DIPOLE_THRESHOLD) {
    return null;
  }
  const [positiveAtomIndex, negativeAtomIndex] =
    diff > 0 ? [fromIndex, toIndex] : [toIndex, fromIndex];
  const posA = atoms[positiveAtomIndex].position;
  const posB = atoms[negativeAtomIndex].position;
  const dx = posB[0] - posA[0];
  const dy = posB[1] - posA[1];
  const dz = posB[2] - posA[2];
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 1e-9) {
    return null;
  }
  const invDist = 1 / distance;
  const direction: Vec3Tuple = [dx * invDist, dy * invDist, dz * invDist];
  const vector: Vec3Tuple = [
    direction[0] * deltaChi,
    direction[1] * deltaChi,
    direction[2] * deltaChi,
  ];
  return {
    positiveAtomIndex,
    negativeAtomIndex,
    deltaChi,
    direction,
    vector,
  };
}

export function computeMolecularPolarity(
  atoms: readonly PolarityAtomInput[],
  bonds: readonly Pick<PolarityBondInput, 'fromIndex' | 'toIndex'>[],
): MolecularPolarityResult {
  const atomShifts = new Array<number>(atoms.length).fill(0);
  const bondDipoles: BondDipole[] = [];
  let netX = 0;
  let netY = 0;
  let netZ = 0;

  for (const bond of bonds) {
    const chiA = ELECTRONEGATIVITY_BY_SYMBOL.get(atoms[bond.fromIndex].symbol);
    const chiB = ELECTRONEGATIVITY_BY_SYMBOL.get(atoms[bond.toIndex].symbol);
    if (chiA === undefined || chiB === undefined) {
      continue;
    }
    const diff = chiB - chiA;
    atomShifts[bond.fromIndex] += diff;
    atomShifts[bond.toIndex] -= diff;

    const dipole = createBondDipole(atoms, bond.fromIndex, bond.toIndex, diff);
    if (dipole !== null) {
      bondDipoles.push(dipole);
      netX += dipole.vector[0];
      netY += dipole.vector[1];
      netZ += dipole.vector[2];
    }
  }

  const netDipoleVector: Vec3Tuple = [netX, netY, netZ];
  const netDipoleMagnitude = Math.hypot(netX, netY, netZ);
  const hasPolarBonds = bondDipoles.length > 0;
  const isPolar = netDipoleMagnitude >= NET_DIPOLE_THRESHOLD;
  const cancelledBySymmetry = hasPolarBonds && !isPolar;

  const partialCharges: AtomPartialCharge[] = atomShifts.map((netShift, atomIndex) => ({
    atomIndex,
    netShift,
    sign: classifyPartialCharge(netShift),
  }));

  return {
    isPolar,
    hasPolarBonds,
    cancelledBySymmetry,
    bondDipoles,
    partialCharges,
    netDipoleVector,
    netDipoleMagnitude,
    centroid: computeCentroid(atoms),
  };
}

export function summarizeSigmaPiBonds(
  bonds: readonly Pick<PolarityBondInput, 'type'>[],
): SigmaPiSummary {
  let piCount = 0;
  let isAromatic = false;

  for (const bond of bonds) {
    if (bond.type === 'double') {
      piCount += 1;
    } else if (bond.type === 'triple') {
      piCount += 2;
    } else if (bond.type === 'aromatic') {
      isAromatic = true;
    }
  }

  return {
    sigmaCount: bonds.length,
    piCount,
    isAromatic,
    hasPiSystem: piCount > 0 || isAromatic,
  };
}
