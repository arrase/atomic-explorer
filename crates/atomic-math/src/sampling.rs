use crate::{OrbitalMode, QuantumNumbers};
use crate::spherical_harmonics::{angular_density_max, real_orbital_angular, y_lm_density, y_lm_theta_component};
use crate::wavefunctions::{r_nl, radial_density_max};

struct Lcg {
    state: u64,
}

impl Lcg {
    fn new(seed: u64) -> Self {
        Self { state: seed.max(1) }
    }
    fn next_f64(&mut self) -> f64 {
        self.state = self
            .state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        let val = (self.state >> 32) as u32;
        (val as f64) / ((u32::MAX as f64) + 1.0)
    }
}

pub fn sample_points_internal(
    qn: &QuantumNumbers,
    mode: &OrbitalMode,
    z_eff: f64,
    n_points: usize,
    seed: u64,
) -> Result<Vec<([f32; 3], f32)>, String> {
    if n_points == 0 {
        return Ok(Vec::new());
    }
    if z_eff <= 0.0 {
        return Err(format!("Effective nuclear charge Z_eff ({}) must be positive", z_eff));
    }
    qn.validate()?;

    let mut rng = Lcg::new(seed);
    let mut points = Vec::with_capacity(n_points);

    let r_max = 5.0 * (qn.n * qn.n) as f64 / z_eff;

    // Strict, unbiased precomputation of p_max:
    // Decoupled into radial maximum A_max and angular maximum B_max:
    // P(r, theta, phi) = (r^2 * |R_nl(r)|^2) * (|Y(theta, phi)|^2 * sin(theta)) <= A_max * B_max
    let a_max = radial_density_max(qn.n, qn.l, z_eff, r_max)?;
    let real_kind = match mode {
        OrbitalMode::RealChemist(kind) => Some(kind),
        OrbitalMode::PureEigenstate => None,
    };
    let b_max = angular_density_max(qn.l, qn.m, real_kind)?;

    let p_max = (a_max * b_max * 1.05).max(1e-12);
    if p_max <= 1e-12 {
        return Err("Sample domain density maximum is zero or negligible".into());
    }

    let max_iterations = n_points.saturating_mul(100_000).max(1_000_000);
    let mut iterations = 0;

    while points.len() < n_points {
        iterations += 1;
        if iterations > max_iterations {
            return Err("Rejection sampling exceeded maximum iteration safety threshold".into());
        }

        let r = rng.next_f64() * r_max;
        let theta = rng.next_f64() * std::f64::consts::PI;
        let phi = rng.next_f64() * 2.0 * std::f64::consts::PI;

        let (density, value) = evaluate_candidate_point(qn, mode, z_eff, r, theta, phi)?;
        if density > rng.next_f64() * p_max {
            let pos = spherical_to_cartesian(r, theta, phi);
            points.push((pos, value));
        }
    }

    Ok(points)
}

fn spherical_to_cartesian(r: f64, theta: f64, phi: f64) -> [f32; 3] {
    let sin_t = theta.sin();
    let cos_t = theta.cos();
    [
        (r * sin_t * phi.cos()) as f32,
        (r * sin_t * phi.sin()) as f32,
        (r * cos_t) as f32,
    ]
}

fn evaluate_candidate_point(
    qn: &QuantumNumbers,
    mode: &OrbitalMode,
    z_eff: f64,
    r: f64,
    theta: f64,
    phi: f64,
) -> Result<(f64, f32), String> {
    let r_part = r_nl(qn.n, qn.l, z_eff, r)?;
    let r2_sin = r * r * theta.sin();
    match mode {
        OrbitalMode::PureEigenstate => {
            let y_dens = y_lm_density(qn.l, qn.m, theta)?;
            let density = r_part * r_part * y_dens * r2_sin;
            let theta_comp = y_lm_theta_component(qn.l, qn.m, theta)?;
            let spatial_sign = r_part * theta_comp;
            let base_phase = (qn.m as f64) * phi;
            let phase = if spatial_sign < 0.0 {
                base_phase + std::f64::consts::PI
            } else {
                base_phase
            };
            let phase_arg = phase.sin().atan2(phase.cos()) as f32;
            Ok((density, phase_arg))
        }
        OrbitalMode::RealChemist(kind) => {
            let y_real = real_orbital_angular(kind, theta, phi);
            let psi = r_part * y_real;
            let density = psi * psi * r2_sin;
            let sign = if psi >= 0.0 { 1.0f32 } else { -1.0f32 };
            Ok((density, sign))
        }
    }
}


