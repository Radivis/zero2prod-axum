pub mod function_name_macro {
    /// Macro that extracts the name of the function it's called from.
    /// Usage: `let name = function_name!();`
    ///
    /// This macro uses the backtrace crate to extract the calling function name at runtime.
    /// Requires debug symbols to be available (compile with debug info).
    #[macro_export]
    macro_rules! function_name {
        () => {{
            let mut function_name = None;
            let mut frame_count = 0;
            let mut all_names = Vec::new();

            backtrace::trace(|frame| {
                frame_count += 1;
                // Skip the first frame (this macro itself)
                if frame_count == 1 {
                    return true; // Continue to next frame
                }

                backtrace::resolve(frame.ip(), |symbol| {
                    if function_name.is_none() {
                        if let Some(name) = symbol.name() {
                            let name_str = name.to_string();
                            all_names.push(name_str.clone());

                            // Look for test functions - they can be in various formats:
                            // - "api::module::function_name" (mangled test binary)
                            // - "zero2prod::tests::api::module::function_name" (unmangled)
                            // We want to find functions that are NOT closures, helpers, or internal symbols
                            let is_test_function = (name_str.contains("api::") && !name_str.contains("helpers::"))
                                || name_str.contains("tests::api")
                                || (name_str.contains("::tests::") && !name_str.contains("helpers::"));

                            if is_test_function {
                                // The function name might be before the hash suffix in mangled names
                                // e.g., "api::health_check::health_check_works::h87ccb05bfd20b6d2"
                                // We want "health_check_works"

                                // Try to extract from mangled format first
                                let parts: Vec<&str> = name_str.split("::").collect();
                                if let Some(last_part) = parts.last() {
                                    // If the last part looks like a hash (starts with 'h' and is hex),
                                    // get the second-to-last part
                                    let candidate = if last_part.starts_with('h') && last_part.len() > 10 {
                                        // Likely a hash, use the part before it
                                        parts.get(parts.len().saturating_sub(2)).copied()
                                    } else {
                                        Some(*last_part)
                                    };

                                    if let Some(func_name) = candidate.filter(|s| {
                                        // Filter out closures and internal Rust symbols
                                        !s.contains("{{closure}}")
                                            && !s.starts_with('<')
                                            && !s.is_empty()
                                            && *s != "fn"
                                            && !s.starts_with("function_name")
                                            && !s.contains("spawn_app")
                                            && !s.contains("helpers::")
                                            && !s.starts_with("_")
                                            && !s.chars().all(|c| c.is_ascii_hexdigit() || c == 'h') // Not just a hash
                                    }) {
                                        function_name = Some(func_name.to_string());
                                    }
                                }
                            }
                        }
                    }
                });
                function_name.is_none() // Continue until we find a function name
            });

            function_name.unwrap_or_else(|| {
                panic!(
                    "Failed to extract function name from backtrace.\n\
                     Frame count: {}\n\
                     Symbol names found: {}\n\
                     Make sure you're compiling with debug symbols (debug = true in Cargo.toml or use 'cargo test' which includes debug info).",
                    frame_count,
                    all_names.join(", ")
                )
            })
        }};
    }

    pub use function_name;
}
