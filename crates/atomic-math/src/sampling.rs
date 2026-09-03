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

    match mode {
        OrbitalMode::PureEigenstate => {
            // In quantum mechanics, pure eigenstates |n, l, m> have probability density
            // |psi|^2 = |R_nl(r)|^2 * |Y_l^m(theta, phi)|^2 = |R_nl(r)|^2 * |Theta_lm(theta)|^2 / (2*pi).
            // This is strictly independent of phi (cylindrical/toroidal symmetry around Z).
            // We sample (r, theta) via rejection against p_max, and assign phi uniformly in [0, 2*pi).
            while points.len() < n_points {
                iterations += 1;
                if iterations > max_iterations {
                    return Err("Rejection sampling exceeded maximum iteration safety threshold".into());
                }

                let r = rng.next_f64() * r_max;
                let theta = rng.next_f64() * std::f64::consts::PI;

                let r_part = r_nl(qn.n, qn.l, z_eff, r)?;
                let y_dens = y_lm_density(qn.l, qn.m, theta)?;
                let density = (r * r * r_part * r_part) * (y_dens * theta.sin());

                let threshold = rng.next_f64() * p_max;
                if density > threshold {
                    // Continuous uniform azimuthal distribution in [0, 2*pi)
                    let phi = rng.next_f64() * 2.0 * std::f64::consts::PI;

                    let sin_t = theta.sin();
                    let cos_t = theta.cos();
                    let x = r * sin_t * phi.cos();
                    let y = r * sin_t * phi.sin();
                    let z = r * cos_t;

                    // Complex quantum phase: Arg(psi) = Arg(R_nl(r) * Theta_lm(theta) * exp(i * m * phi))
                    let theta_comp = y_lm_theta_component(qn.l, qn.m, theta)?;
                    let spatial_sign = r_part * theta_comp;
                    let base_phase = (qn.m as f64) * phi;
                    let phase = if spatial_sign < 0.0 {
                        base_phase + std::f64::consts::PI
                    } else {
                        base_phase
                    };
                    let phase_arg = phase.sin().atan2(phase.cos()) as f32;

                    points.push(([x as f32, y as f32, z as f32], phase_arg));
                }
            }
        }
        OrbitalMode::RealChemist(kind) => {
            // Real chemist orbital representations with real lobes
            while points.len() < n_points {
                iterations += 1;
                if iterations > max_iterations {
                    return Err("Rejection sampling exceeded maximum iteration safety threshold".into());
                }

                let r = rng.next_f64() * r_max;
                let theta = rng.next_f64() * std::f64::consts::PI;
                let phi = rng.next_f64() * 2.0 * std::f64::consts::PI;

                let r_part = r_nl(qn.n, qn.l, z_eff, r)?;
                let y_real = real_orbital_angular(kind, theta, phi);
                let psi = r_part * y_real;
                let density = psi * psi * (r * r * theta.sin());

                let threshold = rng.next_f64() * p_max;
                if density > threshold {
                    let sin_t = theta.sin();
                    let cos_t = theta.cos();
                    let x = r * sin_t * phi.cos();
                    let y = r * sin_t * phi.sin();
                    let z = r * cos_t;
                    let sign = if psi >= 0.0 { 1.0f32 } else { -1.0f32 };
                    points.push(([x as f32, y as f32, z as f32], sign));
                }
            }
        }
    }

    Ok(points)
}

