use crate::math_utils::{associated_laguerre, factorial};

/// Hydrogenic radial wavefunction R_nl(r) given n, l, Z_eff, and r.
pub fn r_nl(n: u32, l: u32, z_eff: f64, r: f64) -> Result<f64, String> {
    if n == 0 {
        return Err("Principal quantum number n must be greater than 0".into());
    }
    if l >= n {
        return Err(format!(
            "Azimuthal quantum number l ({}) must be less than n ({})",
            l, n
        ));
    }
    if z_eff <= 0.0 {
        return Err(format!("Effective nuclear charge Z_eff ({}) must be positive", z_eff));
    }
    if r < 0.0 {
        return Err(format!("Radius r ({}) cannot be negative", r));
    }

    let z = z_eff;
    let zr = z * r;
    let n_f = n as f64;
    let rho = 2.0 * zr / n_f;

    let p = n - l - 1;
    let q = 2 * l + 1;

    let laguerre = associated_laguerre(p, q, rho);

    let num = (2.0 * z / n_f).powi(3) * factorial(n - l - 1)?;
    let den = 2.0 * n_f * factorial(n + l)?;
    let prefactor = (num / den).sqrt();

    let val = prefactor * (-zr / n_f).exp() * rho.powi(l as i32) * laguerre;
    Ok(val)
}

