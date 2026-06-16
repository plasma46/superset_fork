# Run inside the superset_app container after deploy:
#   docker exec -i superset_app superset shell < deploy/assign_comments_permission.py
#
# Assigns the can_write/Comments permission (registered in
# superset/security/manager.py create_custom_permissions) to the Admin role,
# since Flask-AppBuilder creates the permission but does not auto-assign it.
from superset import security_manager
from superset.extensions import db

role = security_manager.find_role("Admin")
perm = security_manager.find_permission_view_menu("can_write", "Comments")

if not perm:
    print("Permission can_write/Comments not found — restart the app first "
          "so create_custom_permissions() runs.")
elif perm in role.permissions:
    print("Admin role already has can_write/Comments.")
else:
    role.permissions.append(perm)
    db.session.commit()
    print("Assigned can_write/Comments to Admin role.")
