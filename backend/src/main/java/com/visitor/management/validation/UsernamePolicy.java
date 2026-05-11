package com.visitor.management.validation;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

public final class UsernamePolicy {

    public static final int MIN_LENGTH = 3;
    public static final int MAX_LENGTH = 32;
    public static final String USERNAME_REGEX = "^[a-z0-9_]{3,32}$";
    public static final String LEGACY_IDENTIFIER_REGEX = "^[a-z0-9][a-z0-9._-]{2,31}$";
    public static final String LENGTH_MESSAGE = "Username must be 3-32 characters long.";
    public static final String INVALID_MESSAGE = "Username can contain only lowercase letters, numbers, and underscores.";

    private static final Pattern USERNAME_PATTERN = Pattern.compile(USERNAME_REGEX);
    private static final Pattern LEGACY_IDENTIFIER_PATTERN = Pattern.compile(LEGACY_IDENTIFIER_REGEX);

    private UsernamePolicy() {
    }

    public static boolean isValid(String value) {
        return USERNAME_PATTERN.matcher(normalizeForStorage(value)).matches();
    }

    public static boolean isLegacyCompatibleIdentifier(String value) {
        return LEGACY_IDENTIFIER_PATTERN.matcher(normalizeForLookup(value)).matches();
    }

    public static String normalizeForStorage(String value) {
        return value == null ? "" : value.trim();
    }

    public static String normalizeForLookup(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    public static Map<String, String> validate(String value) {
        Map<String, String> errors = new LinkedHashMap<>();
        String normalized = normalizeForStorage(value);
        if (normalized.isBlank()) {
            errors.put("required", "Username is required.");
            return errors;
        }
        if (normalized.length() < MIN_LENGTH || normalized.length() > MAX_LENGTH) {
            errors.put("length", LENGTH_MESSAGE);
        }
        if (!USERNAME_PATTERN.matcher(normalized).matches()) {
            errors.put("format", INVALID_MESSAGE);
        }
        return errors;
    }
}
