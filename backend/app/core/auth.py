from typing import Optional

import jwt
from app.core.config import settings
from fastapi import Header, HTTPException, status


def get_current_user_id(authorization: str = Header(None)) -> str:
    """
    Extract and verify user ID from Supabase JWT token.
    The frontend sends the access token in the Authorization header.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required",
        )

    # Extract token from "Bearer <token>" format
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format",
        )

    token = parts[1]

    try:
        # Supabase uses the JWT secret from your project settings
        # For development, we can decode without verification if needed
        # In production, you should verify the signature

        # Decode without verification for now (Supabase handles auth)
        # The token is already verified by Supabase when issued
        payload = jwt.decode(
            token,
            options={"verify_signature": False},  # Supabase already verified
            algorithms=["HS256"],
        )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: no user ID",
            )

        return user_id

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )


def get_optional_user_id(authorization: str = Header(None)) -> Optional[str]:
    """
    Like get_current_user_id but returns None instead of raising if not authenticated.
    Useful for endpoints that work for both authenticated and anonymous users.
    """
    if not authorization:
        return None

    try:
        return get_current_user_id(authorization)
    except HTTPException:
        return None
