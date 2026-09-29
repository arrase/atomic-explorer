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

impl OrbitalMode {
    /// The real chemist variant, or `None` for a pure eigenstate.
    pub fn real_kind(&self) -> Option<&RealOrbitalKind> {
        match self {
            OrbitalMode::RealChemist(kind) => Some(kind),
            OrbitalMode::PureEigenstate => None,
        }
    }
}

/// Builds the state a WASM entry point was asked for.
///
/// Every entry point that takes `use_real_orbital` needs this same
/// translation, and an unsupported real orbital is the one failure they share.
fn state_from_lm(
    n: u32,
    l: u32,
    m: i32,
    use_real_orbital: bool,
) -> Result<(QuantumNumbers, OrbitalMode), String> {
    let qn = QuantumNumbers::new(n, l, m)?;
    let mode = if use_real_orbital {
        let kind = real_orbital_kind_from_lm(l, m).ok_or_else(|| {
            format!(
                "No real orbital representation available for l={}, m={}",
                l, m
            )
        })?;
        OrbitalMode::RealChemist(kind)
    } else {
        OrbitalMode::PureEigenstate
    };
    Ok((qn, mode))
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
        OrbitalMode::PureEigenstate => spherical_harmonics::y_lm_real(qn.l, qn.m, theta, phi)?,
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
    qn.validate()?;
    let r_part = wavefunctions::r_nl(qn.n, qn.l, z_eff, r)?;
    let r_dens = r_part * r_part;

    let ang_dens = match mode {
        OrbitalMode::PureEigenstate => spherical_harmonics::y_lm_density(qn.l, qn.m, theta)?,
        OrbitalMode::RealChemist(kind) => {
            let y = spherical_harmonics::real_orbital_angular(kind, theta, phi);
            y * y
        }
    };

    Ok(r_dens * ang_dens)
}

/// One accepted sample of the Monte Carlo walk over |psi|^2.
#[derive(Clone, Copy, Debug)]
pub struct SamplePoint {
    /// Cartesian position in Bohr radii.
    pub position: [f32; 3],
    /// Phase of psi: continuous arg(psi) in [-pi, pi] for pure eigenstates, and
    /// the sign (+/-1) of psi for real chemist orbitals.
    pub sign: f32,
    /// Local probability density |psi|^2 (no volume element).
    pub density: f64,
}

/// Global peak of |psi|^2, the natural unit for the density transfer function.
///
/// R and Y separate, so the peak of the product is the product of the peaks.
/// Dividing any local |psi|^2 by this value maps the whole cloud onto [0, 1].
pub fn psi_peak_density(
    qn: &QuantumNumbers,
    mode: &OrbitalMode,
    z_eff: f64,
) -> Result<f64, String> {
    qn.validate()?;
    if z_eff <= 0.0 {
        return Err(format!(
            "Effective nuclear charge Z_eff ({}) must be positive",
            z_eff
        ));
    }

    let r_max = wavefunctions::conservative_sampling_radius(qn.n, z_eff);
    let radial_peak = wavefunctions::radial_amplitude_max(qn.n, qn.l, z_eff, r_max)?;
    let angular_peak = spherical_harmonics::angular_amplitude_max(qn.l, qn.m, mode.real_kind())?;

    Ok((radial_peak * angular_peak).max(1e-300))
}

pub fn sample_points(
    qn: &QuantumNumbers,
    mode: &OrbitalMode,
    z_eff: f64,
    n_points: usize,
    seed: u64,
) -> Result<Vec<SamplePoint>, String> {
    sampling::sample_points_internal(qn, mode, z_eff, n_points, seed)
}

/// Stride of the flat buffer returned by `sample_orbital_points`:
/// `[x, y, z, phase_sign, relative_density]` per sample.
pub const SAMPLE_STRIDE: usize = 5;

#[wasm_bindgen]
pub fn sample_orbital_points(
    n: u32,
    l: u32,
    m: i32,
    use_real_orbital: bool,
    z_eff: f64,
    n_points: usize,
    seed: u64,
) -> Result<Vec<f32>, String> {
    let qn = QuantumNumbers::new(n, l, m)?;

    let mode = if use_real_orbital {
        let kind = real_orbital_kind_from_lm(l, m).ok_or_else(|| {
            format!(
                "No real orbital representation available for l={}, m={}",
                l, m
            )
        })?;
        OrbitalMode::RealChemist(kind)
    } else {
        OrbitalMode::PureEigenstate
    };

    let points = sample_points(&qn, &mode, z_eff, n_points, seed)?;
    let peak = psi_peak_density(&qn, &mode, z_eff)?;

    let mut flat = Vec::with_capacity(points.len() * SAMPLE_STRIDE);
    for point in points {
        flat.push(point.position[0]);
        flat.push(point.position[1]);
        flat.push(point.position[2]);
        flat.push(point.sign);
        // Normalising here rather than in the shader keeps the transfer function
        // independent of the units chosen for the wavefunction, and lets the
        // renderer cull points below its floor without knowing Z_eff.
        flat.push((point.density / peak).clamp(0.0, 1.0) as f32);
    }

    Ok(flat)
}

/// Peak value of |psi|^2 over all space, used to normalise the density.
#[wasm_bindgen]
pub fn orbital_peak_density(
    n: u32,
    l: u32,
    m: i32,
    use_real_orbital: bool,
    z_eff: f64,
) -> Result<f64, String> {
    let (qn, mode) = state_from_lm(n, l, m, use_real_orbital)?;
    psi_peak_density(&qn, &mode, z_eff)
}

/// Smallest radius enclosing `quantile` of the electron probability.
#[wasm_bindgen]
pub fn radial_probability_quantile(
    n: u32,
    l: u32,
    z_eff: f64,
    quantile: f64,
) -> Result<f64, String> {
    // m plays no part in a radial integral, and m = 0 is valid for every l, so
    // this validates n and l through the one place that owns those rules.
    QuantumNumbers::new(n, l, 0)?;
    wavefunctions::radial_quantile_radius(n, l, z_eff, quantile)
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
) -> Result<Vec<f32>, String> {
    let (qn, mode) = state_from_lm(n, l, m, use_real_orbital)?;

    let grid = grid::evaluate_density_grid_internal(&qn, &mode, z_eff, grid_size, bounds)?;
    Ok(grid)
}

#[wasm_bindgen]
pub fn evaluate_isosurface_grid(
    n: u32,
    l: u32,
    m: i32,
    use_real_orbital: bool,
    z_eff: f64,
    grid_size: usize,
    bounds_contrast_isolevel: &[f32],
) -> Result<Vec<f32>, String> {
    if bounds_contrast_isolevel.len() < 3 {
        return Err(
            "bounds_contrast_isolevel must contain at least [bounds, contrast, isolevel]".into(),
        );
    }
    let bounds = bounds_contrast_isolevel[0];
    let contrast = bounds_contrast_isolevel[1];
    let isolevel = bounds_contrast_isolevel[2];

    let (qn, mode) = state_from_lm(n, l, m, use_real_orbital)?;

    let grid = grid::evaluate_isosurface_grid_internal(
        &qn, &mode, z_eff, grid_size, bounds, contrast, isolevel,
    )?;
    Ok(grid)
}
