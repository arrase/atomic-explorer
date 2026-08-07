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
        for iy in 0..grid_size {
            let y = -bounds_f64 + (iy as f64) * step;
            for ix in 0..grid_size {
                let x = -bounds_f64 + (ix as f64) * step;

                let r = (x * x + y * y + z * z).sqrt();
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

