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

    let val = match (n, l) {
        (1, 0) => 2.0 * z.powf(1.5) * (-zr).exp(),
        (2, 0) => (1.0 / (2.0 * 2.0_f64.sqrt())) * z.powf(1.5) * (2.0 - zr) * (-zr / 2.0).exp(),
        (2, 1) => (1.0 / (2.0 * 6.0_f64.sqrt())) * z.powf(1.5) * zr * (-zr / 2.0).exp(),
        (3, 0) => {
            (2.0 / (81.0 * 3.0_f64.sqrt()))
                * z.powf(1.5)
                * (27.0 - 18.0 * zr + 2.0 * zr * zr)
                * (-zr / 3.0).exp()
        }
        (3, 1) => {
            (4.0 / (81.0 * 6.0_f64.sqrt()))
                * z.powf(1.5)
                * (6.0 * zr - zr * zr)
                * (-zr / 3.0).exp()
        }
        (3, 2) => {
            (4.0 / (81.0 * 30.0_f64.sqrt())) * z.powf(1.5) * zr * zr * (-zr / 3.0).exp()
        }
        (4, 0) => {
            (1.0 / 768.0)
                * z.powf(1.5)
                * (192.0 - 144.0 * zr + 24.0 * zr * zr - zr * zr * zr)
                * (-zr / 4.0).exp()
        }
        (4, 1) => {
            (1.0 / (256.0 * 15.0_f64.sqrt()))
                * z.powf(1.5)
                * zr
                * (80.0 - 20.0 * zr + zr * zr)
                * (-zr / 4.0).exp()
        }
        (4, 2) => {
            (1.0 / (768.0 * 5.0_f64.sqrt()))
                * z.powf(1.5)
                * zr
                * zr
                * (12.0 - zr)
                * (-zr / 4.0).exp()
        }
        (4, 3) => {
            (1.0 / (768.0 * 35.0_f64.sqrt())) * z.powf(1.5) * zr * zr * zr * (-zr / 4.0).exp()
        }
        _ => {
            let n_f = n as f64;
            let rho = 2.0 * zr / n_f;

            let p = n - l - 1;
            let q = 2 * l + 1;

            let laguerre = associated_laguerre(p, q, rho);

            let num = (2.0 * z / n_f).powi(3) * factorial(n - l - 1)?;
            let den = 2.0 * n_f * factorial(n + l)?;
            let prefactor = (num / den).sqrt();

            prefactor * (-zr / n_f).exp() * rho.powi(l as i32) * laguerre
        }
    };

    Ok(val)
}

