## ADDED Requirements

### Requirement: Project creation
The system SHALL allow creating projects with name, classes, description.

#### Scenario: Create project
- **WHEN** POST /projects with valid payload
- **THEN** returns project with id and status active
