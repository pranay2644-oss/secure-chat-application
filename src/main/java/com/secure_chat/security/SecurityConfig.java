package com.secure_chat.security;

import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * FIX Bug 1: Suppress UserDetailsServiceAutoConfiguration warning.
 * Spring prints "Using generated security password" when no UserDetailsService bean exists.
 * We provide a no-op bean — our auth is entirely JWT-based (JwtFilter), so Spring's
 * built-in form login and basic auth are both disabled. The bean just satisfies the
 * auto-configuration check and silences the warning.
 */
@Configuration
public class SecurityConfig {

    private final JwtFilter jwtFilter;

    public SecurityConfig(JwtFilter jwtFilter) {
        this.jwtFilter = jwtFilter;
    }

    /**
     * FIX Bug 1: provide a UserDetailsService bean so Spring Boot stops printing
     * "Using generated security password: ..." on every startup.
     * This bean is never actually used for authentication — JwtFilter handles that.
     */
    @Bean
    public UserDetailsService userDetailsService() {
        // Empty manager — satisfies the auto-config check, never invoked
        return new InMemoryUserDetailsManager();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {

        http
            .cors(cors -> {})
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            )
            .authorizeHttpRequests(auth -> auth

                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                // Static UI files
                .requestMatchers("/", "/ui/**", "/index.html",
                                  "/css/**", "/js/**", "/images/**",
                                  "/favicon.ico").permitAll()

                // Auth endpoints — public
                .requestMatchers("/api/auth/**").permitAll()

                // Presence — must be public (polled before WS auth completes)
                .requestMatchers("/api/presence/**").permitAll()

                // Chat + user + profile APIs — JWT validated by JwtFilter
                .requestMatchers("/api/chat/**").permitAll()
                .requestMatchers("/api/users/**").permitAll()
                .requestMatchers("/api/profile/**").permitAll()

                // WebSocket handshake + STOMP destination prefixes
                .requestMatchers("/chat/**", "/app/**",
                                  "/topic/**", "/queue/**", "/user/**").permitAll()

                .anyRequest().authenticated()
            )
            .formLogin(login -> login.disable())
            .httpBasic(basic -> basic.disable());

        http.addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(List.of("*"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("Authorization"));
        config.setAllowCredentials(false);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
