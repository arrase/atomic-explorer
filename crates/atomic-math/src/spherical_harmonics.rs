use crate::math_utils::{associated_legendre, factorial};
use crate::RealOrbitalKind;

pub fn y_lm_real(l: u32, m: i32, theta: f64, phi: f64) -> Result<f64, String> {
    let m_abs = m.unsigned_abs();
    if m_abs > l {
        return Err(format!(
            "Magnetic quantum number m ({}) magnitude exceeds azimuthal l ({})",
            m, l
        ));
    }
    let x = theta.cos();
    let plm = associated_legendre(l, m_abs as i32, x)?;

    let l_f = l as f64;
    let num_fact = factorial(l - m_abs)?;
    let den_fact = factorial(l + m_abs)?;
    let prefactor = (((2.0 * l_f + 1.0) / (4.0 * std::f64::consts::PI)) * (num_fact / den_fact)).sqrt();

    let phi_part = if m == 0 {
        1.0
    } else if m > 0 {
        std::f64::consts::SQRT_2 * (m as f64 * phi).cos()
    } else {
        std::f64::consts::SQRT_2 * (m.abs() as f64 * phi).sin()
    };

    let phase = if m_abs % 2 == 1 { -1.0 } else { 1.0 };
    Ok(prefactor * phase * plm * phi_part)
}

/// Probability density |Y_l^m(theta, phi)|^2 for a pure eigenstate.
/// Pure eigenstates have azimuthal symmetry: |Y_l^m(theta, phi)|^2 is strictly independent of phi.
pub fn y_lm_density(l: u32, m: i32, theta: f64) -> Result<f64, String> {
    let m_abs = m.unsigned_abs();
    if m_abs > l {
        return Err(format!(
            "Magnetic quantum number m ({}) magnitude exceeds azimuthal l ({})",
            m, l
        ));
    }
    let x = theta.cos();
    let plm = associated_legendre(l, m_abs as i32, x)?;

    let l_f = l as f64;
    let num_fact = factorial(l - m_abs)?;
    let den_fact = factorial(l + m_abs)?;
    let prefactor = ((2.0 * l_f + 1.0) / (4.0 * std::f64::consts::PI)) * (num_fact / den_fact);

    Ok(prefactor * plm * plm)
}

/// Signed polar amplitude of Y_l^m(theta, phi) without the exp(i*m*phi) phase factor.
pub fn y_lm_theta_component(l: u32, m: i32, theta: f64) -> Result<f64, String> {
    let m_abs = m.unsigned_abs();
    if m_abs > l {
        return Err(format!(
            "Magnetic quantum number m ({}) magnitude exceeds azimuthal l ({})",
            m, l
        ));
    }
    let x = theta.cos();
    let plm = associated_legendre(l, m_abs as i32, x)?;

    let l_f = l as f64;
    let num_fact = factorial(l - m_abs)?;
    let den_fact = factorial(l + m_abs)?;
    let prefactor = (((2.0 * l_f + 1.0) / (4.0 * std::f64::consts::PI)) * (num_fact / den_fact)).sqrt();

    let phase = if m >= 0 && (m % 2 != 0) { -1.0 } else { 1.0 };
    Ok(prefactor * phase * plm)
}

/// Computes the exact maximum of |Y(theta, phi)|^2 * sin(theta) over the angular domain.
pub fn angular_density_max(
    l: u32,
    m: i32,
    real_kind: Option<&RealOrbitalKind>,
) -> Result<f64, String> {
    let mut b_max = 0.0;
    let steps_theta = 200;

    if let Some(kind) = real_kind {
        let steps_phi = 200;
        for i in 0..=steps_theta {
            let theta = (i as f64) * std::f64::consts::PI / (steps_theta as f64);
            let sin_t = theta.sin();
            if sin_t <= 1e-14 {
                continue;
            }
            for j in 0..steps_phi {
                let phi = (j as f64) * 2.0 * std::f64::consts::PI / (steps_phi as f64);
                let y = real_orbital_angular(kind, theta, phi);
                let val = y * y * sin_t;
                if val > b_max {
                    b_max = val;
                }
            }
        }
    } else {
        // Pure eigenstate: independent of phi! 1D scan in theta.
        for i in 0..=steps_theta {
            let theta = (i as f64) * std::f64::consts::PI / (steps_theta as f64);
            let sin_t = theta.sin();
            if sin_t <= 1e-14 {
                continue;
            }
            let y_dens = y_lm_density(l, m, theta)?;
            let val = y_dens * sin_t;
            if val > b_max {
                b_max = val;
            }
        }
    }

    Ok(b_max)
}

pub fn real_orbital_angular(kind: &RealOrbitalKind, theta: f64, phi: f64) -> f64 {
    let sin_t = theta.sin();
    let cos_t = theta.cos();
    let sin_p = phi.sin();
    let cos_p = phi.cos();

    let pi = std::f64::consts::PI;

    match kind {
        RealOrbitalKind::S => 0.5 * (1.0 / pi).sqrt(),
        RealOrbitalKind::Pz => 0.5 * (3.0 / pi).sqrt() * cos_t,
        RealOrbitalKind::Px => 0.5 * (3.0 / pi).sqrt() * sin_t * cos_p,
        RealOrbitalKind::Py => 0.5 * (3.0 / pi).sqrt() * sin_t * sin_p,
        RealOrbitalKind::Dz2 => 0.25 * (5.0 / pi).sqrt() * (3.0 * cos_t * cos_t - 1.0),
        RealOrbitalKind::Dxz => 0.5 * (15.0 / pi).sqrt() * sin_t * cos_t * cos_p,
        RealOrbitalKind::Dyz => 0.5 * (15.0 / pi).sqrt() * sin_t * cos_t * sin_p,
        RealOrbitalKind::Dx2y2 => 0.25 * (15.0 / pi).sqrt() * sin_t * sin_t * (2.0 * phi).cos(),
        RealOrbitalKind::Dxy => 0.25 * (15.0 / pi).sqrt() * sin_t * sin_t * (2.0 * phi).sin(),
        RealOrbitalKind::Fz3 => {
            0.25 * (7.0 / pi).sqrt() * (5.0 * cos_t * cos_t * cos_t - 3.0 * cos_t)
        }
        RealOrbitalKind::Fxz2 => {
            0.25 * (10.5 / pi).sqrt() * sin_t * (5.0 * cos_t * cos_t - 1.0) * cos_p
        }
        RealOrbitalKind::Fyz2 => {
            0.25 * (10.5 / pi).sqrt() * sin_t * (5.0 * cos_t * cos_t - 1.0) * sin_p
        }
        RealOrbitalKind::FzX2Y2 => {
            0.25 * (105.0 / pi).sqrt() * sin_t * sin_t * cos_t * (2.0 * phi).cos()
        }
        RealOrbitalKind::Fxyz => {
            0.25 * (105.0 / pi).sqrt() * sin_t * sin_t * cos_t * (2.0 * phi).sin()
        }
        RealOrbitalKind::FxX23Y2 => {
            0.25 * (17.5 / pi).sqrt() * sin_t * sin_t * sin_t * (3.0 * phi).cos()
        }
        RealOrbitalKind::Fy3X2Y2 => {
            0.25 * (17.5 / pi).sqrt() * sin_t * sin_t * sin_t * (3.0 * phi).sin()
        }
    }
}

