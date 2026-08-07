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

impl QuantumNumbers {
    pub fn new(n: u32, l: u32, m: i32) -> Result<Self, String> {
        let qn = Self { n, l, m };
        qn.validate()?;
        Ok(qn)
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.n == 0 {
            return Err("Principal quantum number n must be greater than 0".into());
        }
        if self.l >= self.n {
            return Err(format!(
                "Azimuthal quantum number l ({}) must be less than n ({})",
                self.l, self.n
            ));
        }
        if self.m.unsigned_abs() > self.l {
            return Err(format!(
                "Magnetic quantum number m ({}) magnitude cannot exceed l ({})",
                self.m, self.l
            ));
        }
        Ok(())
    }
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

pub fn real_orbital_kind_from_lm(l: u32, m: i32) -> Option<RealOrbitalKind> {
    match (l, m) {
        (0, 0) => Some(RealOrbitalKind::S),
        (1, 0) => Some(RealOrbitalKind::Pz),
        (1, 1) => Some(RealOrbitalKind::Px),
        (1, -1) => Some(RealOrbitalKind::Py),
        (2, 0) => Some(RealOrbitalKind::Dz2),
        (2, 1) => Some(RealOrbitalKind::Dxz),
        (2, -1) => Some(RealOrbitalKind::Dyz),
        (2, 2) => Some(RealOrbitalKind::Dx2y2),
        (2, -2) => Some(RealOrbitalKind::Dxy),
        (3, 0) => Some(RealOrbitalKind::Fz3),
        (3, 1) => Some(RealOrbitalKind::Fxz2),
        (3, -1) => Some(RealOrbitalKind::Fyz2),
        (3, 2) => Some(RealOrbitalKind::FzX2Y2),
        (3, -2) => Some(RealOrbitalKind::Fxyz),
        (3, 3) => Some(RealOrbitalKind::FxX23Y2),
        (3, -3) => Some(RealOrbitalKind::Fy3X2Y2),
        _ => None,
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OrbitalMode {
    PureEigenstate,
    RealChemist(RealOrbitalKind),
}

pub fn wavefunction_value(
    qn: &QuantumNumbers,
    mode: &OrbitalMode,
    z_eff: f64,
    r: f64,
    theta: f64,
    phi: f64,
) -> Result<f64, String> {
    qn.validate()?;
    let r_part = wavefunctions::r_nl(qn.n, qn.l, z_eff, r)?;

    let angular_part = match mode {
        OrbitalMode::PureEigenstate => {
            let m_abs = qn.m.unsigned_abs();
            let x = theta.cos();
            let plm = math_utils::associated_legendre(qn.l, m_abs as i32, x)?;
            let l_f = qn.l as f64;
            let num_fact = math_utils::factorial(qn.l - m_abs)?;
            let den_fact = math_utils::factorial(qn.l + m_abs)?;
            let norm = (((2.0 * l_f + 1.0) / (4.0 * std::f64::consts::PI)) * (num_fact / den_fact)).sqrt();
            let trig = if qn.m >= 0 { (qn.m as f64 * phi).cos() } else { (qn.m.abs() as f64 * phi).sin() };
            norm * plm * trig
        }
        OrbitalMode::RealChemist(kind) => {
            spherical_harmonics::real_orbital_angular(kind, theta, phi)
        }
    };

    Ok(r_part * angular_part)
}

pub fn probability_density(
    qn: &QuantumNumbers,
    mode: &OrbitalMode,
    z_eff: f64,
    r: f64,
    theta: f64,
    phi: f64,
) -> Result<f64, String> {
    let psi = wavefunction_value(qn, mode, z_eff, r, theta, phi)?;
    Ok(psi * psi)
}

pub fn sample_points(
    qn: &QuantumNumbers,
    mode: &OrbitalMode,
    z_eff: f64,
    n_points: usize,
    seed: u64,
) -> Result<Vec<([f32; 3], f32)>, String> {
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
) -> Result<js_sys::Float32Array, String> {
    let qn = QuantumNumbers::new(n, l, m)?;

    let mode = if use_real_orbital {
        let kind = real_orbital_kind_from_lm(l, m).ok_or_else(|| {
            format!("No real orbital representation available for l={}, m={}", l, m)
        })?;
        OrbitalMode::RealChemist(kind)
    } else {
        OrbitalMode::PureEigenstate
    };

    let points = sample_points(&qn, &mode, z_eff, n_points, seed)?;

    let mut flat = Vec::with_capacity(points.len() * 4);
    for (p, sign) in points {
        flat.push(p[0]);
        flat.push(p[1]);
        flat.push(p[2]);
        flat.push(sign);
    }

    Ok(js_sys::Float32Array::from(flat.as_slice()))
}

#[wasm_bindgen]
pub fn get_slater_z_eff(z: u32, n: u32, l: u32) -> Result<f64, String> {
    slater::calculate_slater_z_eff(z, n, l)
}

#[wasm_bindgen]
pub fn calculate_transition_wavelength(z_eff: f64, n1: u32, n2: u32) -> Result<f64, String> {
    transition::calculate_transition(z_eff, n1, n2).map(|res| res.wavelength_nm)
}

#[wasm_bindgen]
pub fn is_dipole_transition_allowed(l1: u32, m1: i32, l2: u32, m2: i32) -> bool {
    transition::is_dipole_allowed(l1, m1, l2, m2)
}

#[wasm_bindgen]
pub fn calculate_spontaneous_emission_rate(
    z_eff: f64,
    n1: u32,
    l1: u32,
    n2: u32,
    l2: u32,
) -> Result<f64, String> {
    transition::spontaneous_emission_rate(z_eff, n1, l1, n2, l2)
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
) -> Result<js_sys::Float32Array, String> {
    let qn = QuantumNumbers::new(n, l, m)?;
    let mode = if use_real_orbital {
        let kind = real_orbital_kind_from_lm(l, m).ok_or_else(|| {
            format!("No real orbital representation available for l={}, m={}", l, m)
        })?;
        OrbitalMode::RealChemist(kind)
    } else {
        OrbitalMode::PureEigenstate
    };

    let grid = grid::evaluate_density_grid_internal(&qn, &mode, z_eff, grid_size, bounds)?;
    Ok(js_sys::Float32Array::from(grid.as_slice()))
}

