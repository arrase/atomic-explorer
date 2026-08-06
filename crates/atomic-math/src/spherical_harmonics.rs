use crate::math_utils::{associated_legendre, factorial};
use crate::RealOrbitalKind;

pub fn y_lm_real_squared(l: u32, m: i32, theta: f64) -> f64 {
    let m_abs = m.unsigned_abs();
    let x = theta.cos();
    let plm = associated_legendre(l, m_abs as i32, x);

    let l_f = l as f64;
    let prefactor = ((2.0 * l_f + 1.0) / (4.0 * std::f64::consts::PI))
        * (factorial(l - m_abs) / factorial(l + m_abs));

    prefactor * plm * plm
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
