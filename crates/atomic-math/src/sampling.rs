use crate::{wavefunction_value, OrbitalMode, QuantumNumbers};

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

    let mut p_max = 0.0;

    // 1. Deterministic peak scan around expected radial maximum r ≈ n^2 / Z_eff
    let r_peak_approx = (qn.n * qn.n) as f64 / z_eff;
    let grid_radii = [
        0.1 * r_peak_approx,
        0.5 * r_peak_approx,
        1.0 * r_peak_approx,
        1.5 * r_peak_approx,
        2.0 * r_peak_approx,
    ];
    let grid_thetas = [0.0, 0.25 * std::f64::consts::PI, 0.5 * std::f64::consts::PI, 0.75 * std::f64::consts::PI, std::f64::consts::PI];
    let grid_phis = [0.0, 0.25 * std::f64::consts::PI, 0.5 * std::f64::consts::PI, 0.75 * std::f64::consts::PI];

    for &r in &grid_radii {
        for &theta in &grid_thetas {
            for &phi in &grid_phis {
                let psi = wavefunction_value(qn, mode, z_eff, r, theta, phi)?;
                let weight = r * r * theta.sin();
                let density = psi * psi * weight;
                if density > p_max {
                    p_max = density;
                }
            }
        }
    }

    // 2. Uniform random stochastic scan
    for _ in 0..1000 {
        let r = rng.next_f64() * r_max;
        let theta = rng.next_f64() * std::f64::consts::PI;
        let phi = rng.next_f64() * 2.0 * std::f64::consts::PI;

        let psi = wavefunction_value(qn, mode, z_eff, r, theta, phi)?;
        let weight = r * r * theta.sin();
        let density = psi * psi * weight;
        if density > p_max {
            p_max = density;
        }
    }

    p_max *= 1.25;
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

        let psi = wavefunction_value(qn, mode, z_eff, r, theta, phi)?;
        let weight = r * r * theta.sin();
        let density = psi * psi * weight;
        if density > p_max {
            p_max = density * 1.2;
        }

        let threshold = rng.next_f64() * p_max;
        if density > threshold {
            let x = r * theta.sin() * phi.cos();
            let y = r * theta.sin() * phi.sin();
            let z = r * theta.cos();
            let sign = if psi >= 0.0 { 1.0f32 } else { -1.0f32 };
            points.push(([x as f32, y as f32, z as f32], sign));
        }
    }

    Ok(points)
}

