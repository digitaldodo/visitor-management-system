package com.visitor.management.entity;

public enum EmployeeAttendanceStatus {
    INSIDE,
    OUTSIDE,
    LATE,
    SUSPENDED,

    // Legacy values are retained only so older attendance documents can still be read.
    PRESENT,
    LATE_ENTRY,
    EARLY_EXIT,
    OVERTIME,
    ABSENT,
    SHIFT_VIOLATION
}
