package com.visitor.management.security;

import com.visitor.management.config.AppProperties;
import com.visitor.management.config.CorsOriginResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final ApiAuthenticationEntryPoint authenticationEntryPoint;
    private final ApiAccessDeniedHandler accessDeniedHandler;
    private final AppProperties properties;
    private final CorsOriginResolver corsOriginResolver;

    public SecurityConfig(
            JwtAuthenticationFilter jwtAuthenticationFilter,
            ApiAuthenticationEntryPoint authenticationEntryPoint,
            ApiAccessDeniedHandler accessDeniedHandler,
            AppProperties properties,
            CorsOriginResolver corsOriginResolver
    ) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.authenticationEntryPoint = authenticationEntryPoint;
        this.accessDeniedHandler = accessDeniedHandler;
        this.properties = properties;
        this.corsOriginResolver = corsOriginResolver;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .headers(headers -> headers
                        .contentSecurityPolicy(csp -> csp.policyDirectives(properties.getSecurityHeaders().getContentSecurityPolicy()))
                        .frameOptions(frame -> frame.deny())
                        .contentTypeOptions(contentType -> {})
                        .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31536000))
                )
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(exception -> exception
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler)
                )
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(PublicEndpointRequestMatchers.publicAnyMethodPaths()).permitAll()
                        .requestMatchers(HttpMethod.POST, PublicEndpointRequestMatchers.publicPostAuthPaths()).permitAll()
                        .requestMatchers("/api/v1/notifications/**").hasAnyRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "SECURITY_GUARD", "VISITOR")
                        .requestMatchers("/api/v1/admin/**").hasAnyRole("SUPER_ADMIN", "ADMIN")
                        .requestMatchers("/api/v1/employee/**").hasRole("EMPLOYEE")
                        .requestMatchers("/api/v1/security/**").hasRole("SECURITY_GUARD")
                        .requestMatchers("/api/v1/visitor/**").hasRole("VISITOR")
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(corsOriginResolver.resolveAllowedOrigins());
        configuration.setAllowedMethods(List.of("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With", "Cache-Control", "Pragma"));
        configuration.setExposedHeaders(List.of("Authorization", "X-Request-Id"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public UserDetailsService userDetailsService() {
        return username -> {
            throw new UsernameNotFoundException("User lookup is handled by JWT authentication.");
        };
    }
}
