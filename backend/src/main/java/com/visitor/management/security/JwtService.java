package com.visitor.management.security;

import com.visitor.management.config.AppProperties;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class JwtService {

    private final AppProperties.Jwt jwtProperties;
    private final SecretKey secretKey;

    public JwtService(AppProperties properties) {
        this.jwtProperties = properties.getJwt();
        this.secretKey = Keys.hmacShaKeyFor(jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8));
    }

    public String generateToken(String subject, Set<Role> roles) {
        return generateToken(subject, null, roles);
    }

    public String generateAccessToken(User user) {
        return generateToken(user.getId(), user.getEmail(), user.getRoles());
    }

    public String generateToken(String subject, String email, Set<Role> roles) {
        Instant now = Instant.now();
        Instant expiresAt = now.plusSeconds(jwtProperties.getExpirationMinutes() * 60);

        var builder = Jwts.builder()
                .subject(subject)
                .issuer(jwtProperties.getIssuer())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiresAt))
                .claim("roles", roles.stream().map(Role::name).toList());

        if (email != null && !email.isBlank()) {
            builder.claim("email", email);
        }

        return builder.signWith(secretKey).compact();
    }

    public Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(secretKey)
                .requireIssuer(jwtProperties.getIssuer())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public String getSubject(String token) {
        return parseClaims(token).getSubject();
    }

    public Instant getAccessTokenExpiresAt() {
        return Instant.now().plusSeconds(jwtProperties.getExpirationMinutes() * 60);
    }

    public long getRefreshExpirationDays() {
        return jwtProperties.getRefreshExpirationDays();
    }

    @SuppressWarnings("unchecked")
    public Set<Role> getRoles(String token) {
        Object rolesClaim = parseClaims(token).get("roles", List.class);
        if (rolesClaim == null) {
            return Set.of();
        }
        return ((List<String>) rolesClaim)
                .stream()
                .map(Role::valueOf)
                .collect(Collectors.toSet());
    }
}
