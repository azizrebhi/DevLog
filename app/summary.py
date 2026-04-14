from collections import Counter

def calculate_summary(sessions: list) -> dict:
    if not sessions:
        return {
            "total_sessions": 0,
            "total_minutes": 0,
            "top_project": None,
            "most_common_blocker": None
        }

    total_minutes = 0
    projects = []
    blockers = []
    for session in sessions:
        total_minutes += int(session.duration)
        projects.append(session.project)
        blockers.append(session.blockers)

    project_counter = Counter(projects)
    blocker_counter = Counter(blockers)

    top_project = project_counter.most_common(1)[0][0] if project_counter else None
    most_common_blocker = blocker_counter.most_common(1)[0][0] if blocker_counter else None

    return {
        "total_sessions": len(sessions),
        "total_minutes": total_minutes,
        "top_project": top_project,
        "most_common_blocker": most_common_blocker
    }