package com.visitor.management.security;

import com.visitor.management.entity.Role;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.repository.UserRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final UserRepository userRepository;

    public JwtAuthenticationFilter(JwtService jwtService, UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return PublicEndpointRequestMatchers.isPublic(request);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String authorization = request.getHeader("Authorization");

        if (authorization == null || !authorization.startsWith(BEARER_PREFIX)) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authorization.substring(BEARER_PREFIX.length());
        try {
            Claims claims = jwtService.parseClaims(token);
            String subject = claims.getSubject();
            Set<Role> roles = jwtService.getRoles(claims);
            boolean activeUser = userRepository.findById(subject)
                    .map(user -> user.isActive()
                            && (user.getAccountStatus() == null || user.getAccountStatus() == AccountStatus.ACTIVE)
                            && user.getRoles().containsAll(roles)
                            && !tokenIssuedBeforePasswordChange(claims, user.getPasswordChangedAt()))
                    .orElse(false);
            if (!activeUser) {
                SecurityContextHolder.clearContext();
                filterChain.doFilter(request, response);
                return;
            }
            UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                    subject,
                    null,
                    roles.stream().map(role -> new SimpleGrantedAuthority("ROLE_" + role.name())).toList()
            );
            SecurityContextHolder.getContext().setAuthentication(authentication);
        } catch (JwtException | IllegalArgumentException ex) {
            log.debug("JWT authentication failed: {}", ex.getMessage());
            SecurityContextHolder.clearContext();
        }

        filterChain.doFilter(request, response);
    }

    private boolean tokenIssuedBeforePasswordChange(Claims claims, java.time.Instant passwordChangedAt) {
        if (passwordChangedAt == null || claims.getIssuedAt() == null) {
            return false;
        }
        return claims.getIssuedAt().toInstant().isBefore(passwordChangedAt.minusSeconds(1));
    }
}
