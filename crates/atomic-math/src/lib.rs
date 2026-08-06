pub mod grid;
pub mod math_utils;
pub mod sampling;
pub mod slater;
pub mod spherical_harmonics;
pub mod transition;
pub mod wavefunctions;

use wasm_bindgen::prelude::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct QuantumNumbers {
    pub n: u32,
    pub l: u32,
    pub m: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RealOrbitalKind {
    S,
    Px,
    Py,
    Pz,
    Dxy,
    Dxz,
    Dyz,
    Dz2,
    Dx2y2,
    Fz3,
    Fxz2,
    Fyz2,
    Fxyz,
    FzX2Y2,
    FxX23Y2,
    Fy3X2Y2,
}

pub fn real_orbital_kind_from_lm(l: u32, m: i32) -> RealOrbitalKind {
    match (l, m) {
        (0, 0) => RealOrbitalKind::S,
        (1, 0) => RealOrbitalKind::Pz,
        (1, 1) => RealOrbitalKind::Px,
        (1, -1) => RealOrbitalKind::Py,
        (2, 0) => RealOrbitalKind::Dz2,
        (2, 1) => RealOrbitalKind::Dxz,
        (2, -1) => RealOrbitalKind::Dyz,
        (2, 2) => RealOrbitalKind::Dx2y2,
        (2, -2) => RealOrbitalKind::Dxy,
        (3, 0) => RealOrbitalKind::Fz3,
        (3, 1) => RealOrbitalKind::Fxz2,
        (3, -1) => RealOrbitalKind::Fyz2,
        (3, 2) => RealOrbitalKind::FzX2Y2,
        (3, -2) => RealOrbitalKind::Fxyz,
        (3, 3) => RealOrbitalKind::FxX23Y2,
        (3, -3) => RealOrbitalKind::Fy3X2Y2,
        _ => RealOrbitalKind::S,
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OrbitalMode {
    PureEigenstate,
    RealChemist(RealOrbitalKind),
}

pub fn probability_density(
    qn: &QuantumNumbers,
    mode: &OrbitalMode,
    z_eff: f64,
    r: f64,
    theta: f64,
    phi: f64,
) -> f64 {
    let r_part = wavefunctions::r_nl(qn.n, qn.l, z_eff, r);

    let angular_part_sq = match mode {
        OrbitalMode::PureEigenstate => spherical_harmonics::y_lm_real_squared(qn.l, qn.m, theta),
        OrbitalMode::RealChemist(kind) => {
            let y = spherical_harmonics::real_orbital_angular(kind, theta, phi);
            y * y
        }
    };

    r_part * r_part * angular_part_sq
}

pub fn sample_points(
    qn: &QuantumNumbers,
    mode: &OrbitalMode,
    z_eff: f64,
    n_points: usize,
    seed: u64,
) -> Vec<[f32; 3]> {
    sampling::sample_points_internal(qn, mode, z_eff, n_points, seed)
}

#[wasm_bindgen]
pub fn sample_orbital_points(
    n: u32,
    l: u32,
    m: i32,
    use_real_orbital: bool,
    z_eff: f64,
    n_points: usize,
    seed: u64,
) -> js_sys::Float32Array {
    let qn = QuantumNumbers { n, l, m };

    let mode = if use_real_orbital {
        OrbitalMode::RealChemist(real_orbital_kind_from_lm(l, m))
    } else {
        OrbitalMode::PureEigenstate
    };

    let points = sample_points(&qn, &mode, z_eff, n_points, seed);

    let mut flat = Vec::with_capacity(points.len() * 3);
    for p in points {
        flat.push(p[0]);
        flat.push(p[1]);
        flat.push(p[2]);
    }

    js_sys::Float32Array::from(flat.as_slice())
}

#[wasm_bindgen]
pub fn get_slater_z_eff(z: u32, n: u32, l: u32) -> f64 {
    slater::calculate_slater_z_eff(z, n, l)
}

#[wasm_bindgen]
pub fn calculate_transition_wavelength(z_eff: f64, n1: u32, n2: u32) -> f64 {
    transition::calculate_transition(z_eff, n1, n2)
        .map(|res| res.wavelength_nm)
        .unwrap_or(0.0)
}

#[wasm_bindgen]
pub fn evaluate_density_grid(
    n: u32,
    l: u32,
    m: i32,
    use_real_orbital: bool,
    z_eff: f64,
    grid_size: usize,
    bounds: f32,
) -> js_sys::Float32Array {
    let qn = QuantumNumbers { n, l, m };
    let mode = if use_real_orbital {
        OrbitalMode::RealChemist(real_orbital_kind_from_lm(l, m))
    } else {
        OrbitalMode::PureEigenstate
    };

    let grid = grid::evaluate_density_grid_internal(&qn, &mode, z_eff, grid_size, bounds);
    js_sys::Float32Array::from(grid.as_slice())
}
