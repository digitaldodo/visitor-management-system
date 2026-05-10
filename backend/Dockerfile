FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn -B -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -B -DskipTests clean package

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
RUN addgroup --system accessflow && adduser --system --ingroup accessflow accessflow
COPY --from=build /workspace/target/visitor-management-backend-0.0.1-SNAPSHOT.jar app.jar
USER accessflow
ENV SPRING_PROFILES_ACTIVE=prod
ENV PORT=10000
ENV SERVER_ADDRESS=0.0.0.0
EXPOSE 10000
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
