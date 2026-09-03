use crate::{probability_density, OrbitalMode, QuantumNumbers};

/// Evaluate 3D orbital density grid over [-bounds, bounds] in x, y, z.
/// Returns a flat vector of length grid_size^3 in row-major / slice order (x fastest, then y, then z).
pub fn evaluate_density_grid_internal(
    qn: &QuantumNumbers,
    mode: &OrbitalMode,
    z_eff: f64,
    grid_size: usize,
    bounds: f32,
) -> Result<Vec<f32>, String> {
    if grid_size == 0 {
        return Err("Grid size must be greater than 0".into());
    }
    if bounds <= 0.0 {
        return Err(format!("Grid bounds ({}) must be positive", bounds));
    }
    if z_eff <= 0.0 {
        return Err(format!("Effective nuclear charge Z_eff ({}) must be positive", z_eff));
    }
    qn.validate()?;

    let mut data = vec![0.0f32; grid_size * grid_size * grid_size];
    let bounds_f64 = bounds as f64;

    let step = if grid_size > 1 {
        (2.0 * bounds_f64) / ((grid_size - 1) as f64)
    } else {
        0.0
    };

    for iz in 0..grid_size {
        let z = -bounds_f64 + (iz as f64) * step;
        let z2 = z * z;
        for iy in 0..grid_size {
            let y = -bounds_f64 + (iy as f64) * step;
            let y2_z2 = y * y + z2;
            for ix in 0..grid_size {
                let x = -bounds_f64 + (ix as f64) * step;

                let r = (x * x + y2_z2).sqrt();
                let (theta, phi) = if r < 1e-12 {
                    (0.0, 0.0)
                } else {
                    let cos_t = (z / r).clamp(-1.0, 1.0);
                    let theta = cos_t.acos();
                    let phi = y.atan2(x);
                    let phi = if phi < 0.0 {
                        phi + 2.0 * std::f64::consts::PI
                    } else {
                        phi
                    };
                    (theta, phi)
                };

                let density = probability_density(qn, mode, z_eff, r, theta, phi)?;
                let idx = (iz * grid_size + iy) * grid_size + ix;
                data[idx] = density as f32;
            }
        }
    }

    Ok(data)
}

/// Evaluate 3D signed orbital isosurface density grid for Marching Cubes.
/// Returns signed normalized densities in [-1.0, 1.0] row-major (x fastest, then y, then z).
pub fn evaluate_isosurface_grid_internal(
    qn: &QuantumNumbers,
    mode: &OrbitalMode,
    z_eff: f64,
    grid_size: usize,
    bounds: f32,
    contrast: f32,
) -> Result<Vec<f32>, String> {
    if grid_size == 0 {
        return Err("Grid size must be greater than 0".into());
    }
    if bounds <= 0.0 {
        return Err(format!("Grid bounds ({}) must be positive", bounds));
    }
    if z_eff <= 0.0 {
        return Err(format!("Effective nuclear charge Z_eff ({}) must be positive", z_eff));
    }
    qn.validate()?;

    // 1. Peak density calculation for normalization
    let r_max_scan = (4.0 * (qn.n * qn.n) as f64) / z_eff.max(0.5);
    let r_steps = 300;
    let mut max_r_sq = 0.0;
    for i in 1..=r_steps {
        let r = (i as f64 / r_steps as f64) * r_max_scan;
        let r_val = crate::wavefunctions::r_nl(qn.n, qn.l, z_eff, r)?;
        let r_sq = r_val * r_val;
        if r_sq > max_r_sq {
            max_r_sq = r_sq;
        }
    }

    let max_y_sq = match mode {
        OrbitalMode::RealChemist(kind) => {
            let mut my = 0.0;
            let theta_steps = 60;
            let phi_steps = 60;
            for j in 0..=theta_steps {
                let theta = (j as f64 / theta_steps as f64) * std::f64::consts::PI;
                for k in 0..=phi_steps {
                    let phi = (k as f64 / phi_steps as f64) * 2.0 * std::f64::consts::PI;
                    let y = crate::spherical_harmonics::real_orbital_angular(kind, theta, phi);
                    let y_sq = y * y;
                    if y_sq > my {
                        my = y_sq;
                    }
                }
            }
            my
        }
        OrbitalMode::PureEigenstate => {
            let mut my = 0.0;
            let theta_steps = 100;
            for j in 0..=theta_steps {
                let theta = (j as f64 / theta_steps as f64) * std::f64::consts::PI;
                let y_dens = crate::spherical_harmonics::y_lm_density(qn.l, qn.m, theta)?;
                if y_dens > my {
                    my = y_dens;
                }
            }
            my
        }
    };

    let peak_density = (max_r_sq * max_y_sq).max(1e-12);
    let contrast_f64 = contrast as f64;
    let log_contrast_denom = if contrast_f64 > 0.0 {
        1.0 / (1.0 + contrast_f64).ln()
    } else {
        1.0
    };

    let mut data = vec![0.0f32; grid_size * grid_size * grid_size];
    let bounds_f64 = bounds as f64;
    let step = if grid_size > 1 {
        (2.0 * bounds_f64) / ((grid_size - 1) as f64)
    } else {
        0.0
    };

    for iz in 0..grid_size {
        let z = -bounds_f64 + (iz as f64) * step;
        let z2 = z * z;
        for iy in 0..grid_size {
            let y = -bounds_f64 + (iy as f64) * step;
            let y2_z2 = y * y + z2;
            for ix in 0..grid_size {
                let x = -bounds_f64 + (ix as f64) * step;

                let r = (x * x + y2_z2).sqrt();
                if r < 1e-4 {
                    continue;
                }

                let cos_t = (z / r).clamp(-1.0, 1.0);
                let theta = cos_t.acos();
                let phi = y.atan2(x);
                let phi = if phi < 0.0 {
                    phi + 2.0 * std::f64::consts::PI
                } else {
                    phi
                };

                let r_part = crate::wavefunctions::r_nl(qn.n, qn.l, z_eff, r)?;

                let (raw_density, sign) = match mode {
                    OrbitalMode::RealChemist(kind) => {
                        let y_ang = crate::spherical_harmonics::real_orbital_angular(kind, theta, phi);
                        let psi = r_part * y_ang;
                        let s = if psi >= 0.0 { 1.0 } else { -1.0 };
                        (psi * psi, s)
                    }
                    OrbitalMode::PureEigenstate => {
                        let y_dens = crate::spherical_harmonics::y_lm_density(qn.l, qn.m, theta)?;
                        let theta_comp = crate::spherical_harmonics::y_lm_theta_component(qn.l, qn.m, theta)?;
                        let s = if r_part * theta_comp >= 0.0 { 1.0 } else { -1.0 };
                        (r_part * r_part * y_dens, s)
                    }
                };

                let norm_density = (raw_density / peak_density).min(1.0);
                let enhanced_density = if contrast_f64 > 0.0 {
                    (1.0 + contrast_f64 * norm_density).ln() * log_contrast_denom
                } else {
                    norm_density
                };

                let idx = (iz * grid_size + iy) * grid_size + ix;
                data[idx] = (sign * enhanced_density) as f32;
            }
        }
    }

    Ok(data)
}

