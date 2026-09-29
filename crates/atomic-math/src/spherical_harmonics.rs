use crate::math_utils::{associated_legendre, factorial, maximize_on_interval};
use crate::RealOrbitalKind;

fn spherical_harmonic_base(l: u32, m: i32, theta: f64) -> Result<(f64, f64, u32), String> {
    let m_abs = m.unsigned_abs();
    if m_abs > l {
        return Err(format!(
            "Magnetic quantum number m ({}) magnitude exceeds azimuthal l ({})",
            m, l
        ));
    }
    let x = theta.cos().clamp(-1.0, 1.0);
    let plm = associated_legendre(l, m_abs as i32, x)?;
    let l_f = l as f64;
    let num_fact = factorial(l - m_abs)?;
    let den_fact = factorial(l + m_abs)?;
    let prefactor =
        (((2.0 * l_f + 1.0) / (4.0 * std::f64::consts::PI)) * (num_fact / den_fact)).sqrt();
    Ok((prefactor, plm, m_abs))
}

pub fn y_lm_real(l: u32, m: i32, theta: f64, phi: f64) -> Result<f64, String> {
    let (prefactor, plm, m_abs) = spherical_harmonic_base(l, m, theta)?;

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
    let (prefactor, plm, _) = spherical_harmonic_base(l, m, theta)?;

    Ok(prefactor * prefactor * plm * plm)
}

/// Signed polar amplitude of Y_l^m(theta, phi) without the exp(i*m*phi) phase factor.
pub fn y_lm_theta_component(l: u32, m: i32, theta: f64) -> Result<f64, String> {
    let (prefactor, plm, _) = spherical_harmonic_base(l, m, theta)?;

    let phase = if m >= 0 && (m % 2 != 0) { -1.0 } else { 1.0 };
    Ok(prefactor * phase * plm)
}

/// Samples used by the coarse scan that localises an angular peak.
const PEAK_SCAN_STEPS: usize = 200;

/// |Y_lm|^2 of a pure eigenstate, for a pair already checked by `check_lm`.
///
/// `y_lm_density` rejects |m| > l, and its only other failure mode - an
/// out-of-range Legendre argument - is impossible for a real theta, so once the
/// pair is validated the peak scans can stay infallible.
fn pure_density(l: u32, m: i32, theta: f64) -> f64 {
    y_lm_density(l, m, theta).unwrap_or(0.0)
}

/// Rejects quantum numbers `y_lm_density` would reject.
fn check_lm(l: u32, m: i32) -> Result<(), String> {
    y_lm_density(l, m, 0.0).map(|_| ())
}

/// Computes the exact maximum of |Y(theta, phi)|^2 * sin(theta) over the angular domain.
///
/// Every real chemist orbital is `polar(theta) * azimuthal(phi)`, and sin(theta)
/// only touches the polar half, so the density factorises and its peak is the
/// product of two independent 1D maxima. Pure eigenstates are independent of
/// phi outright, so only one scan is needed there.
pub fn angular_density_max(
    l: u32,
    m: i32,
    real_kind: Option<&RealOrbitalKind>,
) -> Result<f64, String> {
    match real_kind {
        Some(kind) => {
            let polar = maximize_on_interval(
                |theta| {
                    let p = real_orbital_polar(kind, theta);
                    p * p * theta.sin()
                },
                0.0,
                std::f64::consts::PI,
                PEAK_SCAN_STEPS,
            )
            .1;
            let azimuthal = maximize_on_interval(
                |phi| {
                    let a = real_orbital_azimuthal(kind, phi);
                    a * a
                },
                0.0,
                2.0 * std::f64::consts::PI,
                PEAK_SCAN_STEPS,
            )
            .1;
            Ok(polar * azimuthal)
        }
        None => {
            check_lm(l, m)?;
            Ok(maximize_on_interval(
                |theta| pure_density(l, m, theta) * theta.sin(),
                0.0,
                std::f64::consts::PI,
                PEAK_SCAN_STEPS,
            )
            .1)
        }
    }
}

/// Computes the exact maximum of |Y(theta, phi)|^2 over the angular domain.
///
/// Unlike `angular_density_max` this is the plain probability-density maximum,
/// without the sin(theta) integration measure. Multiplying it by the maximum of
/// [R_nl]^2 gives the global peak of |psi|^2, which is the natural unit for the
/// density transfer function used when rendering the cloud.
pub fn angular_amplitude_max(
    l: u32,
    m: i32,
    real_kind: Option<&RealOrbitalKind>,
) -> Result<f64, String> {
    match real_kind {
        Some(kind) => {
            let polar = maximize_on_interval(
                |theta| {
                    let p = real_orbital_polar(kind, theta);
                    p * p
                },
                0.0,
                std::f64::consts::PI,
                PEAK_SCAN_STEPS,
            )
            .1;
            let azimuthal = maximize_on_interval(
                |phi| {
                    let a = real_orbital_azimuthal(kind, phi);
                    a * a
                },
                0.0,
                2.0 * std::f64::consts::PI,
                PEAK_SCAN_STEPS,
            )
            .1;
            Ok(polar * azimuthal)
        }
        None => {
            check_lm(l, m)?;
            Ok(maximize_on_interval(
                |theta| pure_density(l, m, theta),
                0.0,
                std::f64::consts::PI,
                PEAK_SCAN_STEPS,
            )
            .1)
        }
    }
}

pub fn real_orbital_angular(kind: &RealOrbitalKind, theta: f64, phi: f64) -> f64 {
    real_orbital_polar(kind, theta) * real_orbital_azimuthal(kind, phi)
}

/// Polar factor of a real chemist orbital: `Y = real_orbital_polar * real_orbital_azimuthal`.
///
/// Every variant in [`RealOrbitalKind`] is a product of a function of `theta`
/// and a function of `phi`, which is what lets `angular_amplitude_max` and
/// `angular_density_max` find the peak with two 1D scans instead of a 2D grid.
fn real_orbital_polar(kind: &RealOrbitalKind, theta: f64) -> f64 {
    let sin_t = theta.sin();
    let cos_t = theta.cos();

    let pi = std::f64::consts::PI;

    match kind {
        RealOrbitalKind::S => 0.5 * (1.0 / pi).sqrt(),
        RealOrbitalKind::Pz => 0.5 * (3.0 / pi).sqrt() * cos_t,
        RealOrbitalKind::Px | RealOrbitalKind::Py => 0.5 * (3.0 / pi).sqrt() * sin_t,
        RealOrbitalKind::Dz2 => 0.25 * (5.0 / pi).sqrt() * (3.0 * cos_t * cos_t - 1.0),
        RealOrbitalKind::Dxz | RealOrbitalKind::Dyz => 0.5 * (15.0 / pi).sqrt() * sin_t * cos_t,
        RealOrbitalKind::Dx2y2 | RealOrbitalKind::Dxy => 0.25 * (15.0 / pi).sqrt() * sin_t * sin_t,
        RealOrbitalKind::Fz3 => {
            0.25 * (7.0 / pi).sqrt() * (5.0 * cos_t * cos_t * cos_t - 3.0 * cos_t)
        }
        // f_xz^2 ~ x(3z^2 - r^2) and f_yz^2 ~ y(3z^2 - r^2).  The constant
        // 0.25*sqrt(21/pi) follows from int x^2(3z^2-r^2)^2 dOmega = 16*pi/21.
        RealOrbitalKind::Fxz2 | RealOrbitalKind::Fyz2 => {
            0.25 * (21.0 / pi).sqrt() * sin_t * (3.0 * cos_t * cos_t - 1.0)
        }
        RealOrbitalKind::FzX2Y2 | RealOrbitalKind::Fxyz => {
            0.25 * (105.0 / pi).sqrt() * sin_t * sin_t * cos_t
        }
        RealOrbitalKind::FxX23Y2 | RealOrbitalKind::Fy3X2Y2 => {
            0.25 * (17.5 / pi).sqrt() * sin_t * sin_t * sin_t
        }
    }
}

/// Azimuthal factor of a real chemist orbital, matching [`real_orbital_polar`].
///
/// The order of the `cos(m phi)` / `sin(m phi)` factor is `|m|`, so the
/// azimuthal factor is independent of `l` except through which variant is used.
fn real_orbital_azimuthal(kind: &RealOrbitalKind, phi: f64) -> f64 {
    match kind {
        RealOrbitalKind::S | RealOrbitalKind::Pz | RealOrbitalKind::Dz2 | RealOrbitalKind::Fz3 => {
            1.0
        }
        RealOrbitalKind::Px => phi.cos(),
        RealOrbitalKind::Py => phi.sin(),
        RealOrbitalKind::Dxz => phi.cos(),
        RealOrbitalKind::Dyz => phi.sin(),
        RealOrbitalKind::Dx2y2 => (2.0 * phi).cos(),
        RealOrbitalKind::Dxy => (2.0 * phi).sin(),
        RealOrbitalKind::Fxz2 => phi.cos(),
        RealOrbitalKind::Fyz2 => phi.sin(),
        RealOrbitalKind::FzX2Y2 => (2.0 * phi).cos(),
        RealOrbitalKind::Fxyz => (2.0 * phi).sin(),
        RealOrbitalKind::FxX23Y2 => (3.0 * phi).cos(),
        RealOrbitalKind::Fy3X2Y2 => (3.0 * phi).sin(),
    }
}
