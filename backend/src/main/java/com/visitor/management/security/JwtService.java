package com.visitor.management.security;

import com.visitor.management.config.AppProperties;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.entity.VisitorStatus;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
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
        Instant passwordChangedAt = user.getPasswordChangedAt();
        return generateToken(user.getId(), user.getEmail(), user.getRoles(), passwordChangedAt);
    }

    public String generateToken(String subject, String email, Set<Role> roles) {
        return generateToken(subject, email, roles, null);
    }

    public String generateToken(String subject, String email, Set<Role> roles, Instant passwordChangedAt) {
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

        if (passwordChangedAt != null) {
            builder.claim("passwordChangedAt", passwordChangedAt.getEpochSecond());
        }

        return builder.signWith(secretKey).compact();
    }

    public String generateVisitorPassToken(
            String securePassId,
            String organizationReference,
            String visitorReference,
            VisitorStatus approvalState,
            String passCode,
            Instant expiresAt
    ) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(securePassId)
                .issuer(jwtProperties.getIssuer())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiresAt))
                .claims(Map.of(
                        "type", "visitor-pass",
                        "organizationReference", organizationReference,
                        "visitorReference", visitorReference,
                        "approvalState", approvalState.name(),
                        "passCode", passCode
                ))
                .signWith(secretKey)
                .compact();
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
        return getRoles(parseClaims(token));
    }

    @SuppressWarnings("unchecked")
    public Set<Role> getRoles(Claims claims) {
        Object rolesClaim = claims.get("roles", List.class);
        if (rolesClaim == null) {
            return Set.of();
        }
        return ((List<String>) rolesClaim)
                .stream()
                .map(Role::valueOf)
                .collect(Collectors.toSet());
    }
}
