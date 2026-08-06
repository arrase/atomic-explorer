//! Slater's rules for calculating effective nuclear charge Z_eff.

pub fn get_electron_configuration(z: u32) -> Vec<(u32, u32, u32)> {
    if z == 0 {
        return Vec::new();
    }

    // Standard Aufbau filling order: (n, l, max_capacity)
    let standard_subshells = [
        (1, 0, 2),  // 1s
        (2, 0, 2),  // 2s
        (2, 1, 6),  // 2p
        (3, 0, 2),  // 3s
        (3, 1, 6),  // 3p
        (4, 0, 2),  // 4s
        (3, 2, 10), // 3d
        (4, 1, 6),  // 4p
        (5, 0, 2),  // 5s
        (4, 2, 10), // 4d
        (5, 1, 6),  // 5p
        (6, 0, 2),  // 6s
        (4, 3, 14), // 4f
        (5, 2, 10), // 5d
        (6, 1, 6),  // 6p
        (7, 0, 2),  // 7s
        (5, 3, 14), // 5f
        (6, 2, 10), // 6d
        (7, 1, 6),  // 7p
    ];

    let mut remaining = z;
    let mut config: Vec<(u32, u32, u32)> = Vec::new();

    for &(n, l, cap) in &standard_subshells {
        if remaining == 0 {
            break;
        }
        let count = remaining.min(cap);
        config.push((n, l, count));
        remaining -= count;
    }

    // Ground state electron configuration exceptions for Z = 1..118
    match z {
        24 => set_subshell_count(&mut config, &[(4, 0, 1), (3, 2, 5)]), // Cr: 4s1 3d5
        29 => set_subshell_count(&mut config, &[(4, 0, 1), (3, 2, 10)]), // Cu: 4s1 3d10
        41 => set_subshell_count(&mut config, &[(5, 0, 1), (4, 2, 4)]), // Nb: 5s1 4d4
        42 => set_subshell_count(&mut config, &[(5, 0, 1), (4, 2, 5)]), // Mo: 5s1 4d5
        44 => set_subshell_count(&mut config, &[(5, 0, 1), (4, 2, 7)]), // Ru: 5s1 4d7
        45 => set_subshell_count(&mut config, &[(5, 0, 1), (4, 2, 8)]), // Rh: 5s1 4d8
        46 => set_subshell_count(&mut config, &[(5, 0, 0), (4, 2, 10)]), // Pd: 5s0 4d10
        47 => set_subshell_count(&mut config, &[(5, 0, 1), (4, 2, 10)]), // Ag: 5s1 4d10
        57 => set_subshell_count(&mut config, &[(6, 0, 2), (5, 2, 1)]), // La: 6s2 5d1
        58 => set_subshell_count(&mut config, &[(6, 0, 2), (4, 3, 1), (5, 2, 1)]), // Ce
        64 => set_subshell_count(&mut config, &[(6, 0, 2), (4, 3, 7), (5, 2, 1)]), // Gd
        78 => set_subshell_count(&mut config, &[(6, 0, 1), (5, 2, 9)]), // Pt: 6s1 5d9
        79 => set_subshell_count(&mut config, &[(6, 0, 1), (5, 2, 10)]), // Au: 6s1 5d10
        89 => set_subshell_count(&mut config, &[(7, 0, 2), (6, 2, 1)]), // Ac
        90 => set_subshell_count(&mut config, &[(7, 0, 2), (6, 2, 2)]), // Th
        91 => set_subshell_count(&mut config, &[(7, 0, 2), (5, 3, 2), (6, 2, 1)]), // Pa
        92 => set_subshell_count(&mut config, &[(7, 0, 2), (5, 3, 3), (6, 2, 1)]), // U
        93 => set_subshell_count(&mut config, &[(7, 0, 2), (5, 3, 4), (6, 2, 1)]), // Np
        96 => set_subshell_count(&mut config, &[(7, 0, 2), (5, 3, 7), (6, 2, 1)]), // Cm
        103 => set_subshell_count(&mut config, &[(7, 0, 2), (5, 3, 14), (7, 1, 1)]), // Lr
        _ => {}
    }

    config
}

fn set_subshell_count(config: &mut Vec<(u32, u32, u32)>, overrides: &[(u32, u32, u32)]) {
    for &(n, l, count) in overrides {
        if let Some(entry) = config.iter_mut().find(|(cn, cl, _)| *cn == n && *cl == l) {
            entry.2 = count;
        } else if count > 0 {
            config.push((n, l, count));
        }
    }
}

/// Helper to get the numerical rank of a Slater group.
/// Sequence: (1s) < (2s,2p) < (3s,3p) < (3d) < (4s,4p) < (4d) < (4f) < (5s,5p) ...
fn slater_group_rank(n: u32, l: u32) -> u32 {
    let sub_rank = match l {
        0 | 1 => 0, // s/p
        2 => 1,     // d
        _ => 2,     // f and higher
    };
    n * 10 + sub_rank
}

/// Calculate effective nuclear charge Z_eff using Slater's rules for element Z and orbital (n, l).
pub fn calculate_slater_z_eff(z: u32, n: u32, l: u32) -> f64 {
    if z == 0 || n == 0 {
        return 1.0;
    }

    let target_rank = slater_group_rank(n, l);
    let target_is_sp = l <= 1;
    let mut config = get_electron_configuration(z);

    // If target orbital group isn't in config, ensure we track a test electron
    let mut found_target_group = false;
    for (cn, cl, count) in &mut config {
        if slater_group_rank(*cn, *cl) == target_rank {
            found_target_group = true;
            if *cn == n && *cl == l && *count == 0 {
                *count = 1;
            }
            break;
        }
    }

    if !found_target_group {
        config.push((n, l, 1));
    }

    let mut shielding = 0.0;

    for &(cn, cl, count) in &config {
        if count == 0 {
            continue;
        }

        let g_rank = slater_group_rank(cn, cl);

        if g_rank == target_rank {
            // Other electrons in the same group
            let other_count = if cn == n && cl == l {
                count.saturating_sub(1)
            } else {
                count
            };

            let weight = if target_rank == 10 {
                0.30 // 1s
            } else {
                0.35
            };
            shielding += (other_count as f64) * weight;
        } else if target_is_sp {
            if cn == n - 1 {
                shielding += (count as f64) * 0.85;
            } else if cn < n - 1 {
                shielding += (count as f64) * 1.00;
            }
        } else {
            // For d/f orbitals, all groups with lower rank contribute 1.00
            if g_rank < target_rank {
                shielding += (count as f64) * 1.00;
            }
        }
    }

    let z_eff = (z as f64) - shielding;
    z_eff.max(0.1)
}

/// Parse string like "1s", "2p", "3d", "4f" into (n, l).
pub fn parse_orbital_designation(name: &str) -> Option<(u32, u32)> {
    let name = name.trim();
    if name.len() < 2 {
        return None;
    }

    let (n_str, l_str) = name.split_at(name.len() - 1);
    let n = n_str.parse::<u32>().ok()?;
    let l = match l_str.to_lowercase().as_str() {
        "s" => 0,
        "p" => 1,
        "d" => 2,
        "f" => 3,
        "g" => 4,
        _ => return None,
    };

    if n == 0 || l >= n {
        return None;
    }

    Some((n, l))
}

pub fn get_slater_z_eff_by_name(z: u32, orbital_name: &str) -> Result<f64, String> {
    let (n, l) = parse_orbital_designation(orbital_name)
        .ok_or_else(|| format!("Invalid orbital designation: {}", orbital_name))?;
    Ok(calculate_slater_z_eff(z, n, l))
}
